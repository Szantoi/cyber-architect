import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Layers3, Search, Settings2 } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { CadActionButton, CadDataRow, CadIconButton, CadPanelFooter, CadPanelHeader, CadPanelSection, CadPanelShell, CadSegmentTabs, CadStatGrid } from '../components/graph/ui/GraphCadUi.jsx';

function CalibratedPanelFixture() {
  const [activeTab, setActiveTab] = useState('overview');
  const [runs, setRuns] = useState(0);
  return <CadPanelShell data-testid="cad-ui-kit" aria-label="Teszt CAD panel" tone="magenta" density="compact" visualStrength="quiet">
    <CadPanelHeader icon={Settings2} eyebrow="KALIBRÁCIÓ" title="TESZT PANEL" description="Közös fejléc-szerződés" status="AKTÍV" actions={<CadIconButton icon={Search} label="Kereső megnyitása" onClick={() => setRuns(current => current + 1)} />} />
    <CadPanelSection eyebrow="NÉZET" title="TARTALOM">
      <CadSegmentTabs label="Teszt nézetek" activeId={activeTab} onChange={setActiveTab} items={[{ id: 'overview', label: 'ÁTTEKINTÉS' }, { id: 'detail', label: 'RÉSZLETEK' }]} />
      <CadDataRow as="button" icon={Layers3} title="RÉTEGVEREM" detail="2 aktív adatbázisréteg" active={activeTab === 'detail'} onClick={() => setActiveTab('detail')} />
      <CadActionButton icon={Search} onClick={() => setRuns(current => current + 1)}>FUTTATÁS</CadActionButton>
      <output aria-label="Futtatások száma">{runs}</output>
    </CadPanelSection>
    <CadStatGrid items={[{ id: 'nodes', label: 'CSÚCS', value: '31', tone: 'green' }, { id: 'edges', label: 'ÉL', value: '17', tone: 'magenta' }]} />
    <CadPanelFooter>Egységes, rövid információs lábléc.</CadPanelFooter>
  </CadPanelShell>;
}

describe('Graph CAD UI kit', () => {
  it('renders calibrated shell tokens and reusable interactive content primitives', () => {
    render(<CalibratedPanelFixture />);

    const panel = screen.getByTestId('cad-ui-kit');
    expect(panel).toHaveAttribute('data-tone', 'magenta');
    expect(panel).toHaveAttribute('data-density', 'compact');
    expect(screen.getByRole('heading', { name: 'TESZT PANEL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kereső megnyitása' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ÁTTEKINTÉS' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /RÉTEGVEREM/i })).toHaveAttribute('type', 'button');

    fireEvent.click(screen.getByRole('tab', { name: 'RÉSZLETEK' }));
    expect(screen.getByRole('tab', { name: 'RÉSZLETEK' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /RÉTEGVEREM/i })).toHaveAttribute('data-active', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'FUTTATÁS' }));
    expect(screen.getByLabelText('Futtatások száma')).toHaveTextContent('1');
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('Egységes, rövid információs lábléc.')).toBeInTheDocument();
  });
});
