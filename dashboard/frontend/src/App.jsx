import React, { useEffect, useState } from 'react';
import { fetchModels, fetchStates } from './api';
import InsightsTab from './components/InsightsTab';
import ModelResultsTab from './components/ModelResultsTab';
import OverviewTab from './components/OverviewTab';
import SimulatorTab from './components/SimulatorTab';
import StateExplorerTab from './components/StateExplorerTab';
import { FOCUS_STATES } from './theme';

const TABS = [
  { id: 'Overview', label: 'Overview' },
  { id: 'State Explorer', label: 'State Explorer' },
  { id: 'Model Results', label: 'Model Results' },
  { id: 'Insights', label: 'Insights' },
  { id: 'Simulator', label: 'Simulator' },
];

export default function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initTab = initialParams.get('tab') || 'Overview';
  const initState = initialParams.get('state') || 'Delhi';

  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.id === initTab) ? initTab : 'Overview'
  );
  const [selectedFocusState, setSelectedFocusState] = useState(
    FOCUS_STATES.includes(initState) ? initState : 'Delhi'
  );
  const [statesMeta, setStatesMeta] = useState(null);
  const [bestModelName, setBestModelName] = useState('LightGBM');
  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingInit(true);
    setInitError(null);

    Promise.all([fetchStates(), fetchModels('Delhi')])
      .then(([statesRes, modelsRes]) => {
        if (!cancelled) {
          setStatesMeta(statesRes);
          setBestModelName(modelsRes?.best_model?.best_model || 'LightGBM');
          setLoadingInit(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInitError(err.message || 'Failed to connect to FastAPI backend');
          setLoadingInit(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenStateExplorer = (stateName) => {
    if (FOCUS_STATES.includes(stateName)) {
      setSelectedFocusState(stateName);
    }
    setActiveTab('State Explorer');
  };

  return (
    <div className="min-h-screen bg-white text-gray-800 flex flex-col">
      {/* Top Navbar with 5 Tabs */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-3.5 h-8 rounded-sm"
              style={{ backgroundColor: '#204110' }}
            />
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                India State Electricity Demand Forecasting
              </h1>
              <p className="text-xs text-gray-500">
                Weather-Driven Daily Grid Analytics (2014–2024 · Unit: MU = GWh)
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1" aria-label="Main Tabs">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                    isActive
                      ? 'text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  style={
                    isActive ? { backgroundColor: '#204110' } : undefined
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loadingInit ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
            Loading electricity demand artifacts from FastAPI backend…
          </div>
        ) : initError ? (
          <div
            className="bg-white border rounded-xl p-6 text-sm"
            style={{ borderColor: '#e10531', color: '#6b0015' }}
          >
            <div className="font-bold text-base mb-1">
              Unable to reach FastAPI Backend (http://127.0.0.1:8000)
            </div>
            <div>{initError}</div>
          </div>
        ) : (
          <>
            {activeTab === 'Overview' && (
              <OverviewTab
                statesMeta={statesMeta}
                bestModelName={bestModelName}
                onOpenStateExplorer={handleOpenStateExplorer}
              />
            )}

            {activeTab === 'State Explorer' && (
              <StateExplorerTab
                selectedState={selectedFocusState}
                onChangeSelectedState={setSelectedFocusState}
              />
            )}

            {activeTab === 'Model Results' && (
              <ModelResultsTab
                selectedState={selectedFocusState}
                onChangeSelectedState={setSelectedFocusState}
              />
            )}

            {activeTab === 'Insights' && <InsightsTab />}

            {activeTab === 'Simulator' && (
              <SimulatorTab
                selectedState={selectedFocusState}
                onChangeSelectedState={setSelectedFocusState}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
