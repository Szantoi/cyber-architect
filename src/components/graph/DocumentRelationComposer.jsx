import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  GitCompareArrows,
  Link2,
  LoaderCircle,
  Network,
  Plus,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

const EMPTY_LIST = Object.freeze([]);
const text = (value) => String(value ?? "").trim();
const encodePath = (value) => encodeURIComponent(String(value || ""));
const controlClass =
  "min-h-10 border border-white/15 bg-slate-950 px-2.5 font-mono text-xs text-slate-100 outline-none transition-colors focus:border-neonCyan focus:ring-1 focus:ring-neonCyan/35 disabled:cursor-not-allowed disabled:opacity-50";

const relationProfiles = [
  {
    id: "evidence",
    label: "BIZONYÍTOTT",
    detail: "erős, ellenőrzött kapcsolat",
    weight: 0.95,
    confidence: 0.95,
    cost: 1,
    activeClass: "border-plasmaGreen/70 bg-plasmaGreen/10",
  },
  {
    id: "working",
    label: "MUNKAHIPOTÉZIS",
    detail: "operatív, még változhat",
    weight: 0.75,
    confidence: 0.72,
    cost: 2,
    activeClass: "border-neonCyan/70 bg-neonCyan/10",
  },
  {
    id: "explore",
    label: "FELDERÍTENDŐ",
    detail: "gyenge jel, további kutatás kell",
    weight: 0.4,
    confidence: 0.35,
    cost: 4,
    activeClass: "border-amber-200/70 bg-amber-200/10",
  },
];

const initialForm = (document) => ({
  graph_id: "",
  target_document_id: "",
  edge_type_id: "",
  direction: "outbound",
  profile: "working",
  weight: "0.75",
  confidence: "0.72",
  cost: "2",
  visibility: document?.visibility === "public" ? "public" : "private",
  valid_from: "",
  valid_to: "",
  metadata: "{}",
});

const toDateTimeInput = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  // datetime-local is deliberately local-time based. Formatting with UTC and
  // then parsing as local time would move a saved instant by the operator's
  // timezone on every edit.
  const pad = (part) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
};

const relationDraft = (relation) => ({
  weight: String(relation?.weight ?? 1),
  confidence: String(relation?.confidence ?? 1),
  cost: String(relation?.cost ?? 1),
  visibility: relation?.visibility || "private",
  active: relation?.active !== false,
  valid_from: toDateTimeInput(relation?.valid_from),
  valid_to: toDateTimeInput(relation?.valid_to),
  provenance: JSON.stringify(relation?.provenance || {}, null, 2),
  metadata: JSON.stringify(relation?.metadata || {}, null, 2),
});

function parseObject(value, label) {
  try {
    const parsed = JSON.parse(text(value) || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      throw new Error("NOT_OBJECT");
    return parsed;
  } catch {
    throw new Error(`${label}_ÉRVÉNYTELEN_JSON`);
  }
}

function validIso(value, label) {
  if (!text(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`${label}_ÉRVÉNYTELEN_IDŐPONT`);
  return parsed.toISOString();
}

function validateWindow(from, to) {
  if (from && to && Date.parse(to) < Date.parse(from))
    throw new Error("ÉRVÉNYESSÉGI_IDŐABLAK_ÉRVÉNYTELEN");
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function Field({ label, children, hint, testId }) {
  return (
    <label
      data-testid={testId}
      className="flex min-w-0 flex-col gap-1 font-mono text-[8px] font-black uppercase tracking-[.13em] text-slate-500"
    >
      <span>{label}</span>
      {children}
      {hint && (
        <span className="normal-case font-normal tracking-normal text-slate-600">
          {hint}
        </span>
      )}
    </label>
  );
}

function DirectionChoice({ value, checked, onChange, children, Icon: icon }) {
  return (
    <label
      className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 border px-2 font-mono text-[8px] font-black uppercase tracking-[.08em] transition-colors ${checked ? "border-neonMagenta bg-neonMagenta/15 text-neonMagenta shadow-[0_0_18px_rgba(255,0,255,.12)]" : "border-white/15 bg-black/20 text-slate-400 hover:border-neonCyan hover:text-neonCyan"}`}
    >
      <input
        className="sr-only"
        type="radio"
        name="document-relation-direction"
        value={value}
        checked={checked}
        onChange={onChange}
      />
      {React.createElement(icon, { size: 12, "aria-hidden": true })}
      {children}
    </label>
  );
}

function MetricControl({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  unit = "%",
}) {
  const numericValue = Number(value || 0);
  const display =
    unit === "%"
      ? `${Math.round(numericValue * 100)}%`
      : numericValue.toFixed(step < 1 ? 2 : 0);
  return (
    <div className="border border-white/10 bg-black/20 p-2.5">
      <div className="flex items-center justify-between gap-2 font-mono text-[8px] font-black uppercase tracking-[.1em] text-slate-500">
        <span>{label}</span>
        <output className="text-neonCyan">{display}</output>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className="mt-2 w-full accent-cyan-300"
      />
      <div className="mt-1 flex justify-between font-mono text-[7px] text-slate-600">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function relationshipTargetDocument(relation, documents) {
  const postId = Number(relation?.target?.metadata?.post_id);
  return Number.isInteger(postId) && postId > 0
    ? documents.find((candidate) => Number(candidate.id) === postId) || null
    : null;
}

/**
 * Admin-only document relationship workbench. Its only identity input is the
 * current document post ID; canonical Markdown/RAG bindings are resolved and
 * created by the server. It therefore complements rather than reinterprets
 * the Obsidian wikilink base graph.
 */
const DocumentRelationComposer = ({
  document,
  documents = EMPTY_LIST,
  adminFetch,
  onDocumentSelect,
}) => {
  const documentId = document?.id;
  const documentVisibility = document?.visibility;
  const [graphs, setGraphs] = useState(EMPTY_LIST);
  const [edgeTypes, setEdgeTypes] = useState(EMPTY_LIST);
  const [sourceNodes, setSourceNodes] = useState(EMPTY_LIST);
  const [relations, setRelations] = useState(EMPTY_LIST);
  const [selectedSourceNodeId, setSelectedSourceNodeId] = useState("");
  const [form, setForm] = useState(() => initialForm(document));
  const [targetQuery, setTargetQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [relationsVersion, setRelationsVersion] = useState(0);
  const [editingRelation, setEditingRelation] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleteArmedEdgeId, setDeleteArmedEdgeId] = useState("");
  const loadSequence = useRef(0);

  const request = useCallback(
    async (url, options = {}) => {
      const response = await adminFetch(url, options);
      const payload = await readJson(response);
      if (!response.ok)
        throw new Error(
          payload.error || payload.message || `HTTP_${response.status}`,
        );
      return payload;
    },
    [adminFetch],
  );

  const loadContext = useCallback(async () => {
    if (!document?.id) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const [graphData, typeData, bindingData] = await Promise.all([
        request("/api/admin/graphs"),
        request("/api/admin/graphs/edge-types"),
        request(
          `/api/admin/graphs/document-bindings/${encodePath(document.id)}`,
        ),
      ]);
      if (sequence !== loadSequence.current) return;
      const nextGraphs = (graphData.graphs || []).filter(
        (graph) => graph.active !== false,
      );
      const nextSources = bindingData.nodes || [];
      const nextTypes = (typeData.edge_types || []).filter(
        (type) => type.active !== false,
      );
      setGraphs(nextGraphs);
      setEdgeTypes(nextTypes);
      setSourceNodes(nextSources);
      setSelectedSourceNodeId((current) =>
        nextSources.some((node) => node.id === current)
          ? current
          : nextSources[0]?.id || "",
      );
      setForm((current) => ({
        ...current,
        graph_id: nextGraphs.some((graph) => graph.id === current.graph_id)
          ? current.graph_id
          : nextSources[0]?.graph_ids?.find((graphId) =>
              nextGraphs.some((graph) => graph.id === graphId),
            ) ||
            nextGraphs[0]?.id ||
            "",
        edge_type_id: nextTypes.some((type) => type.id === current.edge_type_id)
          ? current.edge_type_id
          : nextTypes[0]?.id || "",
      }));
    } catch (loadError) {
      if (sequence === loadSequence.current)
        setError(`KAPCSOLATI_MUNKAPAD_HIBA: ${loadError.message}`);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [document?.id, request]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);
  useEffect(() => {
    setForm(initialForm({ visibility: documentVisibility }));
    setTargetQuery("");
    setNotice("");
    setSourceNodes(EMPTY_LIST);
    setRelations(EMPTY_LIST);
    setSelectedSourceNodeId("");
    setEditingRelation(null);
    setEditForm(null);
    setDeleteArmedEdgeId("");
  }, [documentId, documentVisibility]);

  const sourceNode = useMemo(
    () =>
      sourceNodes.find((node) => node.id === selectedSourceNodeId) ||
      sourceNodes[0] ||
      null,
    [selectedSourceNodeId, sourceNodes],
  );

  useEffect(() => {
    let current = true;
    if (!sourceNode?.id) {
      setRelations(EMPTY_LIST);
      return () => {
        current = false;
      };
    }
    setRelationsLoading(true);
    request(
      `/api/admin/graphs/nodes/${encodePath(sourceNode.id)}/relations?include_inactive=true`,
    )
      .then((payload) => {
        if (current) setRelations(payload.relations || []);
      })
      .catch((relationError) => {
        if (current) setError(`KAPCSOLATLISTA_HIBA: ${relationError.message}`);
      })
      .finally(() => {
        if (current) setRelationsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [relationsVersion, request, sourceNode?.id]);

  useEffect(() => {
    setEditingRelation(null);
    setEditForm(null);
    setDeleteArmedEdgeId("");
  }, [sourceNode?.id]);

  const targetDocuments = useMemo(() => {
    const query = text(targetQuery).toLocaleLowerCase("hu");
    return documents
      .filter((candidate) => String(candidate.id) !== String(document?.id))
      .filter(
        (candidate) =>
          !query ||
          `${candidate.title} ${candidate.slug}`
            .toLocaleLowerCase("hu")
            .includes(query),
      )
      .sort((first, second) =>
        String(first.title || "").localeCompare(
          String(second.title || ""),
          "hu",
        ),
      );
  }, [document?.id, documents, targetQuery]);
  const targetDocument = useMemo(
    () =>
      targetDocuments.find(
        (candidate) => String(candidate.id) === String(form.target_document_id),
      ) ||
      documents.find(
        (candidate) => String(candidate.id) === String(form.target_document_id),
      ) ||
      null,
    [documents, form.target_document_id, targetDocuments],
  );

  const updateForm = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));
  const updateEditForm = (field) => (event) =>
    setEditForm((current) => ({
      ...current,
      [field]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value,
    }));
  const refreshRelations = () => setRelationsVersion((value) => value + 1);

  const applyProfile = (profile) => {
    setForm((current) => ({
      ...current,
      profile: profile.id,
      weight: String(profile.weight),
      confidence: String(profile.confidence),
      cost: String(profile.cost),
    }));
  };

  const resolveDocumentNode = async (target) => {
    if (Number(target.id) === Number(document.id) && sourceNode)
      return sourceNode;
    const binding = await request(
      `/api/admin/graphs/document-bindings/${encodePath(target.id)}`,
    );
    if (binding.nodes?.length) return binding.nodes[0];
    const ensured = await request(
      `/api/admin/graphs/document-bindings/${encodePath(target.id)}/ensure`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    if (!ensured.node?.id)
      throw new Error("DOKUMENTUM_CSÚCS_NEM_HOZHATÓ_LÉTRE");
    return ensured.node;
  };

  const ensureGraphMembership = async (graphId, node) => {
    if ((node.graph_ids || []).includes(graphId)) return;
    await request(
      `/api/admin/graphs/${encodePath(graphId)}/nodes/${encodePath(node.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          metadata: { attached_via: "document_relation_composer" },
        }),
      },
    );
  };

  const createRelation = async (event) => {
    event.preventDefault();
    if (!document || !targetDocument || !form.graph_id || !form.edge_type_id)
      return;
    setWorking(true);
    setNotice("");
    setError("");
    try {
      const metadata = parseObject(form.metadata, "KAPCSOLATI_METAADAT");
      const validFrom = validIso(form.valid_from, "KEZDETI");
      const validTo = validIso(form.valid_to, "ZÁRÓ");
      validateWindow(validFrom, validTo);
      const currentNode = await resolveDocumentNode(document);
      const targetNode = await resolveDocumentNode(targetDocument);
      await Promise.all([
        ensureGraphMembership(form.graph_id, currentNode),
        ensureGraphMembership(form.graph_id, targetNode),
      ]);
      const isInbound = form.direction === "inbound";
      const bidirectional = form.direction === "both";
      await request("/api/admin/graphs/edges", {
        method: "POST",
        body: JSON.stringify({
          source_node_id: isInbound ? targetNode.id : currentNode.id,
          target_node_id: isInbound ? currentNode.id : targetNode.id,
          edge_type_id: form.edge_type_id,
          graph_ids: [form.graph_id],
          bidirectional,
          origin: "admin",
          weight: Number(form.weight),
          confidence: Number(form.confidence),
          cost: Number(form.cost),
          valid_from: validFrom,
          valid_to: validTo,
          visibility: form.visibility,
          active: true,
          provenance: {
            editor: "document_relation_composer",
            source_document: {
              post_id: Number(document.id),
              slug: text(document.slug),
            },
            target_document: {
              post_id: Number(targetDocument.id),
              slug: text(targetDocument.slug),
            },
          },
          metadata,
        }),
      });
      setNotice(
        bidirectional
          ? "KÉT PÁROSÍTOTT DOKUMENTUMKAPCSOLAT MENTVE"
          : "DOKUMENTUMKAPCSOLAT MENTVE",
      );
      setForm((current) => ({ ...current, target_document_id: "" }));
      await loadContext();
      refreshRelations();
    } catch (createError) {
      setError(`KAPCSOLAT_MENTÉSI_HIBA: ${createError.message}`);
    } finally {
      setWorking(false);
    }
  };

  const beginRelationEdit = (relation) => {
    if (relation.origin !== "admin") return;
    setEditingRelation(relation);
    setEditForm(relationDraft(relation));
    setDeleteArmedEdgeId("");
  };

  const saveRelationParameters = async (event) => {
    event.preventDefault();
    if (!editingRelation?.edge_id || !editForm) return;
    setWorking(true);
    setNotice("");
    setError("");
    try {
      const validFrom = validIso(editForm.valid_from, "KEZDETI");
      const validTo = validIso(editForm.valid_to, "ZÁRÓ");
      validateWindow(validFrom, validTo);
      await request(
        `/api/admin/graphs/edges/${encodePath(editingRelation.edge_id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            weight: Number(editForm.weight),
            confidence: Number(editForm.confidence),
            cost: Number(editForm.cost),
            valid_from: validFrom,
            valid_to: validTo,
            visibility: editForm.visibility,
            active: Boolean(editForm.active),
            provenance: parseObject(editForm.provenance, "PROVENIENCIA"),
            metadata: parseObject(editForm.metadata, "KAPCSOLATI_METAADAT"),
          }),
        },
      );
      setNotice("KAPCSOLATI PARAMÉTEREK MENTVE");
      setEditingRelation(null);
      setEditForm(null);
      refreshRelations();
    } catch (saveError) {
      setError(`KAPCSOLAT_PARAMÉTER_HIBA: ${saveError.message}`);
    } finally {
      setWorking(false);
    }
  };

  const deleteRelation = async (relation) => {
    if (relation.origin !== "admin") return;
    if (deleteArmedEdgeId !== relation.edge_id) {
      setDeleteArmedEdgeId(relation.edge_id);
      return;
    }
    setWorking(true);
    setNotice("");
    setError("");
    try {
      await request(`/api/admin/graphs/edges/${encodePath(relation.edge_id)}`, {
        method: "DELETE",
      });
      setNotice(
        relation.relation_group_id
          ? "A PÁROSÍTOTT KAPCSOLATI PÁR TÖRÖLVE"
          : "DOKUMENTUMKAPCSOLAT TÖRÖLVE",
      );
      setEditingRelation(null);
      setEditForm(null);
      setDeleteArmedEdgeId("");
      refreshRelations();
    } catch (deleteError) {
      setError(`KAPCSOLAT_TÖRLÉSI_HIBA: ${deleteError.message}`);
    } finally {
      setWorking(false);
    }
  };

  const directionDescription =
    form.direction === "inbound"
      ? `${targetDocument?.title || "Cél"} → ${document?.title || "Aktuális dokumentum"}`
      : form.direction === "both"
        ? `${document?.title || "Aktuális dokumentum"} ↔ ${targetDocument?.title || "Cél"}`
        : `${document?.title || "Aktuális dokumentum"} → ${targetDocument?.title || "Cél"}`;

  return (
    <section
      data-testid="document-relation-workbench"
      aria-labelledby="document-relation-composer-title"
      aria-busy={loading || working}
      className="relative mt-5 overflow-hidden border border-neonMagenta/45 bg-[#100a1b] shadow-[0_0_34px_rgba(255,0,255,.08)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_96%_10%,rgba(0,251,251,.16),transparent_18rem),linear-gradient(rgba(255,0,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,0,255,.05)_1px,transparent_1px)] [background-size:auto,20px_20px,20px_20px]" />
      <div className="relative flex flex-col gap-3 border-b border-neonMagenta/25 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.16em] text-neonMagenta">
            <Sparkles size={13} aria-hidden="true" />
            Admin // dokumentumkapcsolati vezérlő
          </p>
          <h2
            id="document-relation-composer-title"
            className="mt-1 font-headline text-xl font-black uppercase text-white"
          >
            Kapcsolat hozzáadása ebből a jegyzetből
          </h2>
          <p className="mt-1 max-w-3xl font-mono text-[9px] leading-relaxed text-slate-400">
            Válassz céljegyzetet, irányt és kapcsolati profilt. A rendszer csak
            explicit DB-élt hoz létre; a cím alapján nem talál ki relációt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="document-relation-source-node"
            className="border border-neonCyan/35 bg-neonCyan/10 px-2 py-1 font-mono text-[8px] font-black text-neonCyan"
          >
            {sourceNode ? sourceNode.id : "DB-KÖTÉS AUTOMATIKUS"}
          </span>
          <button
            type="button"
            onClick={() => {
              loadContext();
              refreshRelations();
            }}
            disabled={loading || working}
            className="inline-flex min-h-8 items-center gap-1.5 border border-white/20 px-2 font-mono text-[8px] font-black text-slate-300 hover:border-neonCyan hover:text-neonCyan disabled:opacity-50"
          >
            <LoaderCircle
              size={11}
              className={loading || relationsLoading ? "animate-spin" : ""}
            />
            FRISSÍTÉS
          </button>
        </div>
      </div>

      <div className="relative p-4">
        {notice && (
          <p
            data-testid="document-relation-status"
            role="status"
            aria-live="polite"
            className="mb-4 border border-plasmaGreen/45 bg-plasmaGreen/10 p-2.5 font-mono text-[9px] font-black text-plasmaGreen"
          >
            ✓ {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mb-4 border border-neonMagenta/50 bg-neonMagenta/10 p-2.5 font-mono text-[9px] font-black text-neonMagenta"
          >
            {error}
          </p>
        )}
        {!loading && !sourceNode && (
          <p className="mb-4 border border-amber-300/35 bg-amber-300/5 p-2.5 font-mono text-[9px] text-amber-100">
            Ehhez a dokumentumhoz még nincs DB-csúcs. Az első mentéskor a
            rendszer a tényleges Vault/RAG-kötésből hozza létre az egyetlen
            kanonikus csúcsot, majd a kiválasztott réteghez rendeli.
          </p>
        )}

        <form
          data-testid="document-relation-create"
          onSubmit={createRelation}
          className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(16rem,.75fr)]"
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Céljegyzet keresése">
                <input
                  type="search"
                  className={controlClass}
                  value={targetQuery}
                  onChange={(event) => setTargetQuery(event.target.value)}
                  placeholder="cím vagy slug"
                  disabled={loading || working}
                />
              </Field>
              <Field label="Céljegyzet" testId="document-relation-target-node">
                <select
                  required
                  aria-label="Céljegyzet"
                  className={controlClass}
                  value={form.target_document_id}
                  onChange={updateForm("target_document_id")}
                  disabled={loading || working || !targetDocuments.length}
                >
                  <option value="">-- DOKUMENTUM VÁLASZTÁSA --</option>
                  {targetDocuments.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title} // {candidate.slug}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Gráfréteg" testId="document-relation-graph">
                <select
                  required
                  aria-label="Kapcsolat gráfrétege"
                  className={controlClass}
                  value={form.graph_id}
                  onChange={updateForm("graph_id")}
                  disabled={loading || working || !graphs.length}
                >
                  <option value="">-- RÉTEG VÁLASZTÁSA --</option>
                  {graphs.map((graph) => (
                    <option key={graph.id} value={graph.id}>
                      {graph.name} // {graph.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kapcsolat típusa">
                <select
                  required
                  aria-label="Kapcsolat típusa"
                  className={controlClass}
                  value={form.edge_type_id}
                  onChange={updateForm("edge_type_id")}
                  disabled={loading || working || !edgeTypes.length}
                >
                  <option value="">-- ÉLTÍPUS VÁLASZTÁSA --</option>
                  {edgeTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label} // {type.id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <fieldset className="border border-white/10 bg-black/20 p-3">
              <legend className="px-1 font-mono text-[8px] font-black uppercase tracking-[.13em] text-slate-500">
                Kapcsolat iránya
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                <DirectionChoice
                  value="outbound"
                  checked={form.direction === "outbound"}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      direction: "outbound",
                    }))
                  }
                  Icon={ArrowRight}
                >
                  Ebből → célba
                </DirectionChoice>
                <DirectionChoice
                  value="inbound"
                  checked={form.direction === "inbound"}
                  onChange={() =>
                    setForm((current) => ({ ...current, direction: "inbound" }))
                  }
                  Icon={ArrowLeft}
                >
                  Célból → ebbe
                </DirectionChoice>
                <DirectionChoice
                  value="both"
                  checked={form.direction === "both"}
                  onChange={() =>
                    setForm((current) => ({ ...current, direction: "both" }))
                  }
                  Icon={GitCompareArrows}
                >
                  Tényleges ↔
                </DirectionChoice>
              </div>
              <p className="mt-2 font-mono text-[8px] text-neonCyan">
                {directionDescription}
              </p>
            </fieldset>

            <fieldset className="border border-white/10 bg-black/20 p-3">
              <legend className="px-1 font-mono text-[8px] font-black uppercase tracking-[.13em] text-slate-500">
                Gyors paraméterprofil
              </legend>
              <div className="grid gap-2 md:grid-cols-3">
                {relationProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={form.profile === profile.id}
                    onClick={() => applyProfile(profile)}
                    className={`min-h-16 border p-2 text-left transition-colors ${form.profile === profile.id ? profile.activeClass : "border-white/10 hover:border-neonCyan/50"}`}
                  >
                    <span className="block font-mono text-[8px] font-black text-slate-200">
                      {profile.label}
                    </span>
                    <span className="mt-1 block font-mono text-[8px] leading-relaxed text-slate-500">
                      {profile.detail}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div
              data-testid="document-relation-parameters"
              className="grid gap-3 md:grid-cols-3"
            >
              <MetricControl
                label="Kapcsolati súly"
                value={form.weight}
                onChange={updateForm("weight")}
              />
              <MetricControl
                label="Bizonyosság"
                value={form.confidence}
                onChange={updateForm("confidence")}
              />
              <MetricControl
                label="Megvalósítási költség"
                value={form.cost}
                onChange={updateForm("cost")}
                min={0}
                max={10}
                step={1}
                unit="pont"
              />
            </div>
          </div>

          <aside className="border border-neonCyan/20 bg-black/25 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[.12em] text-neonCyan">
              <Network size={12} aria-hidden="true" />
              Aktív kapcsolatok
            </p>
            {sourceNodes.length > 1 && (
              <Field label="Forrás DB-csúcs">
                <select
                  aria-label="Forrás DB-csúcs"
                  className={`${controlClass} mt-3`}
                  value={selectedSourceNodeId}
                  onChange={(event) =>
                    setSelectedSourceNodeId(event.target.value)
                  }
                >
                  {sourceNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} // {node.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!loading && !relationsLoading && !relations.length && (
              <p className="mt-3 font-mono text-[8px] leading-relaxed text-slate-500">
                Még nincs közvetlen DB-kapcsolat. A wiki-linkek ettől
                függetlenül változatlanul az alapháló részei.
              </p>
            )}
            <div
              data-testid="document-relation-list"
              className="mt-3 max-h-64 space-y-2 overflow-auto pr-1"
            >
              {relations.map((relation) => {
                const relatedDocument = relationshipTargetDocument(
                  relation,
                  documents,
                );
                const canOpenDocument = Boolean(
                  relatedDocument && onDocumentSelect,
                );
                const isEditable = relation.origin === "admin";
                const DirectionIcon =
                  relation.direction === "outbound" ? ArrowRight : ArrowLeft;
                return (
                  <article
                    key={relation.edge_id}
                    data-testid={`document-relation-row-${relation.edge_id}`}
                    className={`border p-2 ${editingRelation?.edge_id === relation.edge_id ? "border-neonMagenta/65 bg-neonMagenta/5" : "border-white/10 bg-slate-950/60"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {canOpenDocument ? (
                          <button
                            type="button"
                            onClick={() => onDocumentSelect(relatedDocument)}
                            className="flex max-w-full items-center gap-1 text-left font-mono text-[8px] font-black text-slate-200 hover:text-neonCyan"
                          >
                            <DirectionIcon
                              size={11}
                              className={
                                relation.direction === "outbound"
                                  ? "shrink-0 text-neonCyan"
                                  : "shrink-0 text-neonMagenta"
                              }
                            />{" "}
                            <span className="truncate">
                              {relation.target?.label ||
                                relation.target?.node_id}
                            </span>
                          </button>
                        ) : (
                          <p className="flex min-w-0 items-center gap-1 font-mono text-[8px] font-black text-slate-200">
                            <DirectionIcon
                              size={11}
                              className={
                                relation.direction === "outbound"
                                  ? "shrink-0 text-neonCyan"
                                  : "shrink-0 text-neonMagenta"
                              }
                            />{" "}
                            <span className="truncate">
                              {relation.target?.label ||
                                relation.target?.node_id}
                            </span>
                          </p>
                        )}
                        <p className="mt-1 font-mono text-[7px] leading-relaxed text-slate-500">
                          {relation.edge_type?.label || relation.edge_type?.id}{" "}
                          · {Math.round(Number(relation.confidence || 0) * 100)}
                          % bizonyosság · {relation.origin || "—"}
                        </p>
                        {relation.relation_group_id && (
                          <p className="mt-1 font-mono text-[7px] text-neonMagenta">
                            ↔ PÁROSÍTOTT RELÁCIÓ
                          </p>
                        )}
                      </div>
                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => beginRelationEdit(relation)}
                          className="shrink-0 border border-white/15 px-1.5 py-1 font-mono text-[7px] font-black text-slate-400 hover:border-neonCyan hover:text-neonCyan"
                        >
                          PARAMÉTER
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(relation.graph_memberships || []).map((membership) => (
                        <span
                          key={membership.graph_id}
                          className="border border-white/10 px-1 py-0.5 font-mono text-[6px] text-slate-500"
                        >
                          {membership.graph_name || membership.graph_id}
                        </span>
                      ))}
                    </div>
                    {!isEditable && (
                      <p className="mt-2 border-l-2 border-slate-600 pl-1.5 font-mono text-[7px] leading-relaxed text-slate-500">
                        VETÜLET/IMPORT EREDET: a közvetlen paraméterezés zárolt;
                        a forrásrendszer a gazdája.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((value) => !value)}
              className="mt-4 inline-flex min-h-9 items-center gap-1.5 border border-white/15 px-2 font-mono text-[8px] font-black text-slate-400 hover:border-neonCyan hover:text-neonCyan"
            >
              <SlidersHorizontal size={11} />
              {showAdvanced
                ? "HALADÓ PARAMÉTEREK ELREJTÉSE"
                : "HALADÓ PARAMÉTEREK"}
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                <Field label="Láthatóság">
                  <select
                    className={controlClass}
                    value={form.visibility}
                    onChange={updateForm("visibility")}
                    disabled={working}
                  >
                    <option value="private">BELSŐ</option>
                    <option value="public">PUBLIKUS</option>
                  </select>
                </Field>
                <Field label="Érvényes ettől">
                  <input
                    type="datetime-local"
                    step="1"
                    className={controlClass}
                    value={form.valid_from}
                    onChange={updateForm("valid_from")}
                    disabled={working}
                  />
                </Field>
                <Field label="Érvényes eddig">
                  <input
                    type="datetime-local"
                    step="1"
                    className={controlClass}
                    value={form.valid_to}
                    onChange={updateForm("valid_to")}
                    disabled={working}
                  />
                </Field>
                <Field label="Kapcsolati metaadat (JSON objektum)">
                  <textarea
                    className={`${controlClass} min-h-20 resize-y`}
                    value={form.metadata}
                    onChange={updateForm("metadata")}
                    disabled={working}
                  />
                </Field>
              </div>
            )}
          </aside>

          {editingRelation && editForm && (
            <section
              data-testid="document-relation-editor"
              className="xl:col-span-2 border border-neonMagenta/35 bg-black/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[.13em] text-neonMagenta">
                    <Link2 size={12} />
                    Kiválasztott él paraméterei
                  </p>
                  <h3 className="mt-1 font-mono text-xs font-black text-slate-100">
                    {editingRelation.target?.label ||
                      editingRelation.target?.node_id}{" "}
                    ·{" "}
                    {editingRelation.edge_type?.label ||
                      editingRelation.edge_type?.id}
                  </h3>
                  <p className="mt-1 font-mono text-[8px] text-slate-500">
                    {editingRelation.relation_group_id
                      ? "Párosított él: a paraméterek az éppen kijelölt irányra vonatkoznak."
                      : "Egyirányú DB-él."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRelation(null);
                    setEditForm(null);
                    setDeleteArmedEdgeId("");
                  }}
                  disabled={working}
                  className="border border-white/15 px-2 py-1 font-mono text-[8px] font-black text-slate-400 hover:border-white/40"
                >
                  BEZÁRÁS
                </button>
              </div>
              <div
                className="mt-4 space-y-4"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    event.target.tagName !== "TEXTAREA"
                  )
                    event.preventDefault();
                }}
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricControl
                    label="Kapcsolati súly"
                    value={editForm.weight}
                    onChange={updateEditForm("weight")}
                  />
                  <MetricControl
                    label="Bizonyosság"
                    value={editForm.confidence}
                    onChange={updateEditForm("confidence")}
                  />
                  <MetricControl
                    label="Megvalósítási költség"
                    value={editForm.cost}
                    onChange={updateEditForm("cost")}
                    min={0}
                    max={10}
                    step={1}
                    unit="pont"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Láthatóság">
                    <select
                      className={controlClass}
                      value={editForm.visibility}
                      onChange={updateEditForm("visibility")}
                      disabled={working}
                    >
                      <option value="private">BELSŐ</option>
                      <option value="public">PUBLIKUS</option>
                    </select>
                  </Field>
                  <Field label="Érvényes ettől">
                    <input
                      type="datetime-local"
                      step="1"
                      className={controlClass}
                      value={editForm.valid_from}
                      onChange={updateEditForm("valid_from")}
                      disabled={working}
                    />
                  </Field>
                  <Field label="Érvényes eddig">
                    <input
                      type="datetime-local"
                      step="1"
                      className={controlClass}
                      value={editForm.valid_to}
                      onChange={updateEditForm("valid_to")}
                      disabled={working}
                    />
                  </Field>
                  <label className="flex min-h-10 items-center gap-2 border border-white/10 bg-black/20 px-2.5 font-mono text-[8px] font-black uppercase tracking-[.13em] text-slate-400">
                    <input
                      type="checkbox"
                      checked={editForm.active}
                      onChange={updateEditForm("active")}
                      disabled={working}
                    />{" "}
                    AKTÍV
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Proveniencia (JSON objektum)">
                    <textarea
                      className={`${controlClass} min-h-28 resize-y`}
                      value={editForm.provenance}
                      onChange={updateEditForm("provenance")}
                      disabled={working}
                    />
                  </Field>
                  <Field label="Kapcsolati metaadat (JSON objektum)">
                    <textarea
                      className={`${controlClass} min-h-28 resize-y`}
                      value={editForm.metadata}
                      onChange={updateEditForm("metadata")}
                      disabled={working}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="font-mono text-[8px] leading-relaxed text-slate-500">
                    A mentés a meglévő DB-élt frissíti, az azonosítóját és
                    rétegtagságát változatlanul hagyja.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="document-relation-delete"
                      onClick={() => deleteRelation(editingRelation)}
                      disabled={working}
                      className={`inline-flex min-h-10 items-center gap-1.5 border px-3 font-mono text-[8px] font-black ${deleteArmedEdgeId === editingRelation.edge_id ? "border-red-400 bg-red-500/15 text-red-300" : "border-red-400/55 text-red-300 hover:bg-red-500/10"}`}
                    >
                      <Trash2 size={12} />
                      {deleteArmedEdgeId === editingRelation.edge_id
                        ? editingRelation.relation_group_id
                          ? "PÁR TÖRLÉSE – MEGERŐSÍTÉS"
                          : "TÖRLÉS – MEGERŐSÍTÉS"
                        : "TÖRLÉS"}
                    </button>
                    <button
                      type="button"
                      data-testid="document-relation-save"
                      onClick={saveRelationParameters}
                      disabled={working}
                      className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/70 bg-neonMagenta/10 px-3 font-mono text-[8px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-50"
                    >
                      <Save size={12} />
                      PARAMÉTEREK MENTÉSE
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="xl:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="max-w-2xl font-mono text-[8px] leading-relaxed text-slate-500">
              <CircleDot size={10} className="mr-1 inline text-plasmaGreen" />A
              mentés a kiválasztott gráfrétegben megőrzi az entitások
              azonosítóit; kétirányú opciónál két, közös relation_group_id-jú
              irányított él keletkezik.
            </p>
            <button
              type="submit"
              data-testid="document-relation-create-save"
              disabled={
                loading ||
                working ||
                !form.target_document_id ||
                !form.graph_id ||
                !form.edge_type_id
              }
              className="inline-flex min-h-11 items-center gap-2 border border-neonMagenta/70 bg-neonMagenta/10 px-4 font-mono text-[9px] font-black text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              {form.direction === "both"
                ? "KÉT PÁROSÍTOTT ÉL MENTÉSE"
                : "KAPCSOLAT MENTÉSE"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default DocumentRelationComposer;
