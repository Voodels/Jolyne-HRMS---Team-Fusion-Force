import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import Loader from '../Loader/Loader';
import { fetchDataSourcesInspect } from '../../api/chatbotApi';
import './NeonChromaInspect.css';

function formatMeta(meta) {
  if (!meta || typeof meta !== 'object') return '—';
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

function NeonChromaInspect() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchDataSourcesInspect({ limit });
      setData(json);
    } catch (e) {
      setError(e.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />
      <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <TopBar toggleSidebar={toggleSidebar} />

        <main className="neon-chroma-main">
          <h2>Neon and ChromaDB</h2>
          <p className="neon-chroma-sub">
            Side-by-side sample of Postgres (Neon) <code>candidates</code> rows and the Chroma RAG
            collection used by the SQL-Agent. Counts help verify indexing sync.{' '}
            <Link to="/home">Marketing / login landing</Link> is at <code>/home</code>.
          </p>

          <div className="neon-chroma-toolbar">
            <label htmlFor="neon-chroma-limit">Rows per side</label>
            <select
              id="neon-chroma-limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={loading}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>

          {error && <div className="neon-chroma-error">{error}</div>}

          {loading && !data && <Loader />}

          {data && (
            <>
              <div className="neon-chroma-summary">
                <div className="neon-chroma-summary-card">
                  <span>Neon candidates (total)</span>
                  <strong>{data.neon_total}</strong>
                </div>
                <div className="neon-chroma-summary-card">
                  <span>Chroma documents (total)</span>
                  <strong>{data.chroma_total}</strong>
                </div>
                <div className="neon-chroma-summary-card">
                  <span>RAG / Chroma</span>
                  <strong>{data.chroma_enabled ? 'enabled' : 'off'}</strong>
                </div>
                <div className="neon-chroma-summary-card">
                  <span>Chroma collection</span>
                  <strong>{data.chroma_collection_name || '—'}</strong>
                </div>
              </div>

              <div className="neon-chroma-grid">
                <section className="neon-chroma-panel">
                  <div className="neon-chroma-panel-head">Neon — sample rows</div>
                  <div className="neon-chroma-table-wrap">
                    {data.neon_sample.length === 0 ? (
                      <div className="neon-chroma-empty">No candidate rows returned.</div>
                    ) : (
                      <table className="neon-chroma-table">
                        <thead>
                          <tr>
                            <th>id</th>
                            <th>full_name</th>
                            <th>email</th>
                            <th>updated_at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.neon_sample.map((row) => (
                            <tr key={String(row.id)}>
                              <td className="mono">{String(row.id)}</td>
                              <td>{row.full_name || '—'}</td>
                              <td className="mono">{row.email || '—'}</td>
                              <td className="mono">{row.updated_at || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                <section className="neon-chroma-panel">
                  <div className="neon-chroma-panel-head">Chroma — sample documents</div>
                  <div className="neon-chroma-table-wrap">
                    {!data.chroma_enabled ? (
                      <div className="neon-chroma-empty">
                        Chroma RAG is not initialized (disabled or missing dependencies). Start the
                        SQL-Agent with RAG enabled to see vectors here.
                      </div>
                    ) : data.chroma_sample.length === 0 ? (
                      <div className="neon-chroma-empty">No documents in the collection.</div>
                    ) : (
                      <table className="neon-chroma-table">
                        <thead>
                          <tr>
                            <th>id</th>
                            <th>metadata</th>
                            <th>document preview</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.chroma_sample.map((row) => (
                            <tr key={row.id}>
                              <td className="mono">{row.id}</td>
                              <td className="mono">{formatMeta(row.metadata)}</td>
                              <td className="preview">{row.document_preview || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              </div>

              <div className="neon-chroma-diff">
                <div className="neon-chroma-diff-panel">
                  <h3>Candidate ids in Neon, missing in Chroma (sample)</h3>
                  {data.neon_ids_missing_in_chroma_sample.length === 0 ? (
                    <p className="neon-chroma-empty" style={{ padding: 0 }}>
                      None in this sample slice (or fully in sync for scanned ids).
                    </p>
                  ) : (
                    <ul>
                      {data.neon_ids_missing_in_chroma_sample.map((id) => (
                        <li key={id}>{id}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="neon-chroma-diff-panel">
                  <h3>Chroma ids not in Neon (orphans, sample)</h3>
                  {data.chroma_ids_missing_in_neon_sample.length === 0 ? (
                    <p className="neon-chroma-empty" style={{ padding: 0 }}>
                      No orphan ids in sample (good).
                    </p>
                  ) : (
                    <ul>
                      {data.chroma_ids_missing_in_neon_sample.map((id) => (
                        <li key={id}>{id}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default NeonChromaInspect;
