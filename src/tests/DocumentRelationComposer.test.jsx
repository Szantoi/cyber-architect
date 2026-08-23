import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DocumentRelationComposer from "../components/graph/DocumentRelationComposer.jsx";

const graph = {
  id: "project/prj-document-relations",
  name: "Dokumentum relációk",
  active: true,
  visibility: "private",
};

const edgeType = {
  id: "depends_on",
  label: "Függ ettől",
  active: true,
};

const sourceDocument = {
  id: 4101,
  title: "Forrás jegyzet",
  slug: "forras-jegyzet",
  visibility: "private",
};

const targetDocument = {
  id: 4102,
  title: "Cél jegyzet",
  slug: "cel-jegyzet",
  visibility: "private",
};

const sourceNode = {
  id: "document:source-4101",
  label: sourceDocument.title,
  graph_ids: [graph.id],
  source_system: "markdown",
  source_reference: "kb:source-4101",
};

const targetNode = {
  id: "document:target-4102",
  label: targetDocument.title,
  graph_ids: [],
  source_system: "markdown",
  source_reference: "kb:target-4102",
};

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
});

function renderWorkbench({ relations = [] } = {}) {
  const adminFetch = vi.fn(async (url, options = {}) => {
    if (url === "/api/admin/graphs") return jsonResponse({ graphs: [graph] });
    if (url === "/api/admin/graphs/edge-types")
      return jsonResponse({ edge_types: [edgeType] });
    if (url === `/api/admin/graphs/document-bindings/${sourceDocument.id}`) {
      return jsonResponse({ nodes: [sourceNode] });
    }
    if (url === `/api/admin/graphs/document-bindings/${targetDocument.id}`) {
      return jsonResponse({ nodes: [] });
    }
    if (
      url ===
        `/api/admin/graphs/document-bindings/${targetDocument.id}/ensure` &&
      options.method === "POST"
    ) {
      return jsonResponse(
        { success: true, created: true, node: targetNode },
        201,
      );
    }
    if (
      url ===
      `/api/admin/graphs/nodes/${encodeURIComponent(sourceNode.id)}/relations?include_inactive=true`
    ) {
      return jsonResponse({ source_node: sourceNode, relations });
    }
    if (
      url ===
        `/api/admin/graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(targetNode.id)}` &&
      options.method === "PUT"
    ) {
      return jsonResponse({
        success: true,
        membership: { graph_id: graph.id, node_id: targetNode.id },
      });
    }
    if (url === "/api/admin/graphs/edges" && options.method === "POST") {
      return jsonResponse({ success: true, edge: { id: "edge-created" } }, 201);
    }
    if (
      url === `/api/admin/graphs/edges/${encodeURIComponent("edge-admin")}` &&
      options.method === "PUT"
    ) {
      return jsonResponse({ success: true, edge: { id: "edge-admin" } });
    }
    if (
      url === `/api/admin/graphs/edges/${encodeURIComponent("edge-admin")}` &&
      options.method === "DELETE"
    ) {
      return jsonResponse({ success: true, deleted_id: "edge-admin" });
    }
    throw new Error(`Unexpected request: ${url} ${options.method || "GET"}`);
  });

  render(
    <DocumentRelationComposer
      document={sourceDocument}
      documents={[sourceDocument, targetDocument]}
      adminFetch={adminFetch}
    />,
  );
  return { adminFetch };
}

describe("DocumentRelationComposer", () => {
  it("creates a paired directed relationship through exact document bindings and M:N membership", async () => {
    const { adminFetch } = renderWorkbench();

    expect(
      await screen.findByTestId("document-relation-source-node"),
    ).toHaveTextContent(sourceNode.id);
    fireEvent.change(screen.getByLabelText("Céljegyzet"), {
      target: { value: String(targetDocument.id) },
    });
    fireEvent.click(screen.getByLabelText("Tényleges ↔"));
    fireEvent.change(screen.getByLabelText("Kapcsolati súly"), {
      target: { value: "0.91" },
    });
    fireEvent.change(screen.getByLabelText("Bizonyosság"), {
      target: { value: "0.88" },
    });
    fireEvent.change(screen.getByLabelText("Megvalósítási költség"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByTestId("document-relation-create"));

    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/api/admin/graphs/edges",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/graphs/document-bindings/${targetDocument.id}/ensure`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(targetNode.id)}`,
      expect.objectContaining({ method: "PUT" }),
    );

    const [, options] = adminFetch.mock.calls.find(
      ([url, requestOptions]) =>
        url === "/api/admin/graphs/edges" && requestOptions?.method === "POST",
    );
    expect(JSON.parse(options.body)).toEqual({
      source_node_id: sourceNode.id,
      target_node_id: targetNode.id,
      edge_type_id: edgeType.id,
      graph_ids: [graph.id],
      bidirectional: true,
      origin: "admin",
      weight: 0.91,
      confidence: 0.88,
      cost: 5,
      valid_from: null,
      valid_to: null,
      visibility: "private",
      active: true,
      provenance: {
        editor: "document_relation_composer",
        source_document: {
          post_id: sourceDocument.id,
          slug: sourceDocument.slug,
        },
        target_document: {
          post_id: targetDocument.id,
          slug: targetDocument.slug,
        },
      },
      metadata: {},
    });
    expect(
      await screen.findByTestId("document-relation-status"),
    ).toHaveTextContent("KÉT PÁROSÍTOTT DOKUMENTUMKAPCSOLAT MENTVE");
  });

  it("edits direct admin-edge parameters and requires a deliberate second action before deletion", async () => {
    const relation = {
      edge_id: "edge-admin",
      direction: "outbound",
      target: {
        node_id: targetNode.id,
        label: targetNode.label,
        metadata: { post_id: targetDocument.id },
      },
      edge_type: edgeType,
      graph_ids: [graph.id],
      graph_memberships: [{ graph_id: graph.id, graph_name: graph.name }],
      origin: "admin",
      weight: 0.6,
      confidence: 0.45,
      cost: 4,
      valid_from: "2026-01-10T00:00:00.000Z",
      valid_to: "2026-01-12T10:15:16.000Z",
      visibility: "private",
      active: true,
      provenance: { editor: "manual-test", evidence: "E-7" },
      metadata: { why: "initial" },
    };
    const { adminFetch } = renderWorkbench({ relations: [relation] });

    await screen.findByTestId("document-relation-row-edge-admin");
    fireEvent.click(screen.getByRole("button", { name: "PARAMÉTER" }));
    expect(
      await screen.findByTestId("document-relation-editor"),
    ).toBeInTheDocument();
    const weights = screen.getAllByLabelText("Kapcsolati súly");
    fireEvent.change(weights.at(-1), { target: { value: "0.8" } });
    fireEvent.change(screen.getByLabelText("Proveniencia (JSON objektum)"), {
      target: { value: '{"editor":"manual-test","evidence":"E-8"}' },
    });
    fireEvent.change(
      screen.getByLabelText("Kapcsolati metaadat (JSON objektum)"),
      {
        target: { value: '{"why":"confirmed"}' },
      },
    );
    fireEvent.click(screen.getByTestId("document-relation-save"));

    const updateUrl = `/api/admin/graphs/edges/${encodeURIComponent(relation.edge_id)}`;
    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        updateUrl,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const [, updateOptions] = adminFetch.mock.calls.find(
      ([url, requestOptions]) =>
        url === updateUrl && requestOptions?.method === "PUT",
    );
    expect(JSON.parse(updateOptions.body)).toEqual({
      weight: 0.8,
      confidence: 0.45,
      cost: 4,
      valid_from: "2026-01-10T00:00:00.000Z",
      valid_to: "2026-01-12T10:15:16.000Z",
      visibility: "private",
      active: true,
      provenance: { editor: "manual-test", evidence: "E-8" },
      metadata: { why: "confirmed" },
    });
    expect(
      await screen.findByTestId("document-relation-status"),
    ).toHaveTextContent("KAPCSOLATI PARAMÉTEREK MENTVE");

    fireEvent.click(screen.getByRole("button", { name: "PARAMÉTER" }));
    const deleteButton = await screen.findByTestId("document-relation-delete");
    fireEvent.click(deleteButton);
    expect(deleteButton).toHaveTextContent("TÖRLÉS – MEGERŐSÍTÉS");
    expect(
      adminFetch.mock.calls.some(
        ([url, options]) => url === updateUrl && options?.method === "DELETE",
      ),
    ).toBe(false);

    fireEvent.click(deleteButton);
    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        updateUrl,
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(
      await screen.findByTestId("document-relation-status"),
    ).toHaveTextContent("DOKUMENTUMKAPCSOLAT TÖRÖLVE");
  });
});
