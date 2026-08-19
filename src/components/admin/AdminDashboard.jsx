import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../context/ContentContext';
import { useAuth } from '../../context/AuthContext';
import HelpPanel, { HelpButton } from './HelpPanel.jsx';
import AdminLogin from './AdminLogin.jsx';

// Modular Tabs
import HeroSettingsTab from './tabs/HeroSettingsTab.jsx';
import SkillsTab from './tabs/SkillsTab.jsx';
import ProjectsTab from './tabs/ProjectsTab.jsx';
import BlogPostsTab from './tabs/BlogPostsTab.jsx';
import MessagesTab from './tabs/MessagesTab.jsx';
import AgentMessagesTab from './tabs/AgentMessagesTab.jsx';
import OrgMatrixTab from './tabs/OrgMatrixTab.jsx';
import AuditLogsTab from './tabs/AuditLogsTab.jsx';
import SecurityPinTab from './tabs/SecurityPinTab.jsx';

const AdminDashboard = () => {
  const { settings, skills, projects, refreshContent } = useContent();
  const { adminToken, loginAdmin, logoutAdmin, adminFetch } = useAuth();

  const [activeTab, setActiveTab] = useState('settings');
  const [helpOpen, setHelpOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  // Editable States
  const [settingsForm, setSettingsForm] = useState(settings);
  const [blogsList, setBlogsList] = useState([]);
  const [messagesList, setMessagesList] = useState([]);
  const [auditList, setAuditList] = useState([]);

  // Modal / Editing states
  const [editingSkill, setEditingSkill] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [editingBlog, setEditingBlog] = useState(null);
  const [showMarkdownCheatSheet, setShowMarkdownCheatSheet] = useState(false);

  // Agent Messages & Handoffs States
  const [agentMessages, setAgentMessages] = useState([]);
  const [agentStats, setAgentStats] = useState({});
  const [showTransmitModal, setShowTransmitModal] = useState(false);
  const [transmitForm, setTransmitForm] = useState({
    sender: 'root',
    recipient: 'conductor',
    subject: '',
    body: '',
    message_type: 'handoff',
    related_link: ''
  });

  // Terminals & Organizational Matrix State
  const [terminalsList, setTerminalsList] = useState([]);

  // Google Drive Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Sync settingsForm when settings context changes
  useEffect(() => {
    setSettingsForm(settings);
  }, [settings]);

  const showNotify = (msg, isError = false) => {
    setNotification({ text: msg, isError });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load Admin Data when logged in
  const loadAdminData = async () => {
    if (!adminToken) return;
    try {
      const bRes = await adminFetch('/api/admin/blog');
      if (bRes.ok) setBlogsList(await bRes.json());

      const mRes = await adminFetch('/api/admin/messages');
      if (mRes.ok) setMessagesList(await mRes.json());

      const aRes = await adminFetch('/api/admin/audit');
      if (aRes.ok) setAuditList(await aRes.json());

      const agRes = await adminFetch('/api/admin/agent-messages');
      if (agRes.ok) {
        const data = await agRes.json();
        setAgentMessages(data.messages || []);
        setAgentStats(data.stats || {});
      }

      const termRes = await adminFetch('/api/admin/terminals');
      if (termRes.ok) {
        const data = await termRes.json();
        setTerminalsList(data.terminals || []);
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
    }
  };

  useEffect(() => {
    if (adminToken) {
      loadAdminData();
    }
  }, [adminToken]);

  // 1. Settings Handler
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm)
      });
      if (res.ok) {
        showNotify('SETTINGS_UPDATED_SUCCESSFULLY');
        refreshContent();
      } else {
        showNotify('FAILED_TO_UPDATE_SETTINGS', true);
      }
    } catch {
      showNotify('NETWORK_ERROR', true);
    }
  };

  // 2. Skill Handlers
  const handleSaveSkill = async (e) => {
    e.preventDefault();
    try {
      const isNew = !editingSkill.id;
      const url = isNew ? '/api/admin/skills' : `/api/admin/skills/${editingSkill.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await adminFetch(url, {
        method,
        body: JSON.stringify(editingSkill)
      });

      if (res.ok) {
        showNotify(isNew ? 'SKILL_CREATED' : 'SKILL_UPDATED');
        setEditingSkill(null);
        refreshContent();
      } else {
        showNotify('SAVE_FAILED', true);
      }
    } catch {
      showNotify('NETWORK_ERROR', true);
    }
  };

  const handleDeleteSkill = async (id) => {
    if (!window.confirm('PURGE_SKILL_MODULE_CONFIRM?')) return;
    try {
      const res = await adminFetch(`/api/admin/skills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotify('SKILL_PURGED');
        refreshContent();
      } else {
        showNotify('DELETE_FAILED', true);
      }
    } catch {
      showNotify('DELETE_FAILED', true);
    }
  };

  // 3. Project Handlers
  const handleSaveProject = async (e) => {
    e.preventDefault();
    try {
      const isNew = !projects.some(p => p.id === editingProject.id);
      const url = isNew ? '/api/admin/projects' : `/api/admin/projects/${editingProject.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await adminFetch(url, {
        method,
        body: JSON.stringify(editingProject)
      });

      if (res.ok) {
        showNotify(isNew ? 'PROJECT_CREATED' : 'PROJECT_UPDATED');
        setEditingProject(null);
        refreshContent();
      } else {
        showNotify('SAVE_FAILED', true);
      }
    } catch {
      showNotify('NETWORK_ERROR', true);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('PURGE_PROJECT_RECORD_CONFIRM?')) return;
    try {
      const res = await adminFetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotify('PROJECT_PURGED');
        refreshContent();
      } else {
        showNotify('DELETE_FAILED', true);
      }
    } catch {
      showNotify('DELETE_FAILED', true);
    }
  };

  // 4. Blog Handlers & Drive Sync
  const handleSaveBlog = async (e) => {
    e.preventDefault();
    try {
      const isNew = !editingBlog.id;
      const url = isNew ? '/api/admin/blog' : `/api/admin/blog/${editingBlog.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await adminFetch(url, {
        method,
        body: JSON.stringify(editingBlog)
      });

      if (res.ok) {
        showNotify(isNew ? 'DOKUMENTUM_LÉTREHOZVA' : 'DOKUMENTUM_FRISSÍTVE');
        setEditingBlog(null);
        loadAdminData();
      } else {
        showNotify('SAVE_FAILED', true);
      }
    } catch {
      showNotify('NETWORK_ERROR', true);
    }
  };

  const handleDeleteBlog = async (id) => {
    if (!window.confirm('BIZTOSAN_TÖRLÖD_A_DOKUMENTUMOT?')) return;
    try {
      const res = await adminFetch(`/api/admin/blog/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotify('DOKUMENTUM_TÖRÖLVE');
        loadAdminData();
      } else {
        showNotify('DELETE_FAILED', true);
      }
    } catch {
      showNotify('DELETE_FAILED', true);
    }
  };

  const handleConnectDrive = async () => {
    try {
      const res = await adminFetch('/api/admin/drive/auth-url');
      if (res.ok) {
        const data = await res.json();
        const url = data.auth_url || data.authUrl;
        if (url) {
          window.location.href = url;
        } else {
          showNotify('NEM_SIKERÜLT_GENERÁLNI_AZ_AUTH_URL-T', true);
        }
      } else {
        showNotify('HIBA_A_GOOGLE_KAPCSOLÓDÁSNÁL', true);
      }
    } catch {
      showNotify('GOOGLE_CONNECT_ERROR', true);
    }
  };

  const handleDriveSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await adminFetch('/api/admin/drive/sync', { method: 'POST' });
      const data = await res.json();
      const report = data.report || data;
      if (res.ok && (data.success || report.synced !== undefined)) {
        setSyncResult(report);
        showNotify(`DRIVE_SZINKRONIZÁCIÓ_SIKERES: ${report.synced || 0} fájl (${report.created || 0} új, ${report.updated || 0} frissítve)`);
        loadAdminData();
      } else {
        showNotify(`SZINKRONIZÁCIÓS_HIBA: ${data.error || data.message || 'Ismeretlen hiba'}`, true);
        if (data.details) setSyncResult({ errors: [{ file: 'Auth', error: data.details }] });
      }
    } catch {
      showNotify('HÁLÓZATI_HIBA_A_SZINKRONIZÁLÁSKOR', true);
    } finally {
      setIsSyncing(false);
    }
  };

  // 5. Message Handlers
  const handleMarkMessageRead = async (id) => {
    try {
      const res = await adminFetch(`/api/admin/messages/${id}/read`, { method: 'PUT' });
      if (res.ok) {
        showNotify('MESSAGE_ACKNOWLEDGED');
        loadAdminData();
      }
    } catch {
      showNotify('ACTION_FAILED', true);
    }
  };

  const handleDeleteMessage = async (id) => {
    if (!window.confirm('PURGE_MESSAGE_CONFIRM?')) return;
    try {
      const res = await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotify('MESSAGE_PURGED');
        loadAdminData();
      }
    } catch {
      showNotify('DELETE_FAILED', true);
    }
  };

  // 6. Agent Message Handlers
  const handleTransmitAgentMessage = async (e) => {
    e.preventDefault();
    try {
      const res = await adminFetch('/api/admin/agent-messages', {
        method: 'POST',
        body: JSON.stringify(transmitForm)
      });
      if (res.ok) {
        showNotify('AGENT_MESSAGE_TRANSMITTED_SUCCESSFULLY');
        setShowTransmitModal(false);
        setTransmitForm({
          sender: 'root',
          recipient: 'conductor',
          subject: '',
          body: '',
          message_type: 'handoff',
          related_link: ''
        });
        loadAdminData();
      } else {
        const err = await res.json();
        showNotify(err.error || 'TRANSMISSION_FAILED', true);
      }
    } catch {
      showNotify('NETWORK_ERROR', true);
    }
  };

  const handleUpdateAgentMessageStatus = async (id, status) => {
    try {
      const res = await adminFetch(`/api/admin/agent-messages/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        showNotify(`MESSAGE_#${id}_SET_TO_${status.toUpperCase()}`);
        loadAdminData();
      }
    } catch {
      showNotify('STATUS_UPDATE_FAILED', true);
    }
  };

  const handleDeleteAgentMessage = async (id) => {
    if (!window.confirm(`BIZTOSAN_TÖRLÖD_A(Z)_#${id}_SZÁMÚ_ÜZENETET?`)) return;
    try {
      const res = await adminFetch(`/api/admin/agent-messages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotify(`MESSAGE_#${id}_PURGED`);
        loadAdminData();
      }
    } catch {
      showNotify('DELETE_FAILED', true);
    }
  };

  // 7. Terminal Handlers
  const handleSaveTerminal = async (payload, isEditing) => {
    const isNew = !isEditing;
    const url = isNew ? '/api/admin/terminals' : `/api/admin/terminals/${payload.id}`;
    const method = isNew ? 'POST' : 'PUT';

    const res = await adminFetch(url, {
      method,
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showNotify(isNew ? `TERMINAL_REGISTERED: @${payload.id}` : `TERMINAL_UPDATED: @${payload.id}`);
      loadAdminData();
    } else {
      const err = await res.json();
      showNotify(err.error || 'SAVE_FAILED', true);
    }
  };

  const handleDeleteTerminal = async (id) => {
    if (!window.confirm(`BIZTOSAN_TÖRLÖD_A(Z)_@${id}_TERMINÁLT?`)) return;
    try {
      const res = await adminFetch(`/api/admin/terminals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotify(`TERMINAL_PURGED: @${id}`);
        loadAdminData();
      } else {
        const err = await res.json();
        showNotify(err.error || 'DELETE_FAILED', true);
      }
    } catch {
      showNotify('DELETE_FAILED', true);
    }
  };

  // 8. Audit Rollback & PIN Handlers
  const handleRollback = async (auditId) => {
    try {
      const res = await adminFetch(`/api/admin/audit/${auditId}/rollback`, {
        method: 'POST'
      });
      if (res.ok) {
        showNotify(`ROLLBACK_EXECUTED_FOR_AUDIT_#${auditId}`);
        refreshContent();
        loadAdminData();
      } else {
        const err = await res.json();
        showNotify(err.error || 'ROLLBACK_FAILED', true);
      }
    } catch {
      showNotify('ROLLBACK_FAILED', true);
    }
  };

  const handleUpdatePin = async (newPinCode) => {
    const res = await adminFetch('/api/admin/security/pin', {
      method: 'PUT',
      body: JSON.stringify({ pin: newPinCode })
    });
    if (res.ok) {
      showNotify('PIN_CODE_OVERRIDDEN_SUCCESSFULLY');
    } else {
      showNotify('PIN_UPDATE_FAILED', true);
      throw new Error('PIN_UPDATE_FAILED');
    }
  };

  // If not logged in, render the clean AdminLogin component
  if (!adminToken) {
    return <AdminLogin onLogin={loginAdmin} />;
  }

  return (
    <div className="min-h-screen bg-background pt-24 pb-20 relative text-on-surface">
      <div className="container mx-auto px-6 max-w-7xl">
        {/* Top Control Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b-2 dark:border-white/10 border-slate-900 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 bg-plasmaGreen animate-pulse"></span>
              <span className="font-mono text-neonCyan text-xs uppercase tracking-[0.3em] font-bold">
                SYSTEM_ADMIN // OVERSEER_CONSOLE
              </span>
            </div>
            <h1 className="text-4xl font-headline font-black italic uppercase text-on-surface tracking-tight mt-1">
              Tactical CMS Matrix.
            </h1>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <HelpButton onClick={() => setHelpOpen(true)} />
            <Link
              to="/"
              className="px-4 py-2 border-2 dark:border-white/10 border-slate-900 dark:bg-slate-900/80 bg-[#cad4e2] text-slate-900 dark:text-slate-300 shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:bg-slate-900 hover:text-white transition-colors uppercase font-bold"
            >
              PREVIEW_SITE ↗
            </Link>
            <button
              onClick={logoutAdmin}
              className="px-4 py-2 bg-neonMagenta/20 border-2 border-neonMagenta text-neonMagenta hover:bg-neonMagenta hover:text-white shadow-[2px_2px_0_#0f172a] dark:shadow-none transition-colors uppercase font-bold"
            >
              TERMINATE_SESSION
            </button>
          </div>
        </div>

        {/* Global Notification Toast */}
        {notification && (
          <div className={`mb-6 p-4 font-mono text-xs border-2 ${
            notification.isError 
              ? 'bg-neonMagenta/15 border-neonMagenta text-neonMagenta' 
              : 'bg-neonCyan/15 border-neonCyan text-neonCyan'
          } flex items-center justify-between shadow-[3px_3px_0_#0f172a] font-bold`}>
            <span>{notification.isError ? '[ERROR] ' : '[OK] '}{notification.text}</span>
            <button onClick={() => setNotification(null)} className="dark:text-white text-slate-900 hover:opacity-75 font-bold">✕</button>
          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap gap-2 mb-8 border-b-2 dark:border-white/10 border-slate-900 pb-4">
          {[
            { id: 'settings', label: 'GLOBAL_SETTINGS', icon: 'tune' },
            { id: 'skills', label: `ARSENAL (${skills.length})`, icon: 'terminal' },
            { id: 'projects', label: `THE_GRID (${projects.length})`, icon: 'folder' },
            { id: 'blog', label: `BLOG_LOGS (${blogsList.length})`, icon: 'article' },
            { id: 'messages', label: `UPLINK_INBOX (${messagesList.filter(m => !m.read_status).length})`, icon: 'mail' },
            { id: 'agent_messages', label: `AGENT_HANDOFFS (${agentMessages.filter(m => m.status === 'unread').length})`, icon: 'hub' },
            { id: 'organization', label: `ORG_MATRIX (${terminalsList.length})`, icon: 'lan' },
            { id: 'audit', label: `AUDIT_STREAM (${auditList.length})`, icon: 'history' },
            { id: 'security', label: 'SECURITY_PIN', icon: 'lock' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 font-mono text-xs uppercase px-4 py-2.5 transition-all rounded-none border-2 ${
                activeTab === tab.id
                  ? 'dark:bg-neonCyan dark:text-black bg-slate-900 text-white border-slate-950 shadow-[3px_3px_0_#0f172a] font-black'
                  : 'dark:bg-surface-container-lowest bg-[#cad4e2] dark:text-slate-400 text-slate-900 border-slate-900 shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:bg-slate-900 hover:text-white font-bold'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab 1: Hero & Global Settings */}
        {activeTab === 'settings' && (
          <HeroSettingsTab
            settingsForm={settingsForm}
            setSettingsForm={setSettingsForm}
            onSave={handleSaveSettings}
          />
        )}

        {/* Tab 2: Skills Management */}
        {activeTab === 'skills' && (
          <SkillsTab
            skills={skills}
            editingSkill={editingSkill}
            setEditingSkill={setEditingSkill}
            onSaveSkill={handleSaveSkill}
            onDeleteSkill={handleDeleteSkill}
          />
        )}

        {/* Tab 3: Projects Grid Management */}
        {activeTab === 'projects' && (
          <ProjectsTab
            projects={projects}
            editingProject={editingProject}
            setEditingProject={setEditingProject}
            onSaveProject={handleSaveProject}
            onDeleteProject={handleDeleteProject}
          />
        )}

        {/* Tab 4: Blog & Knowledge Base CMS */}
        {activeTab === 'blog' && (
          <BlogPostsTab
            blogsList={blogsList}
            editingBlog={editingBlog}
            setEditingBlog={setEditingBlog}
            onSaveBlog={handleSaveBlog}
            onDeleteBlog={handleDeleteBlog}
            showMarkdownCheatSheet={showMarkdownCheatSheet}
            setShowMarkdownCheatSheet={setShowMarkdownCheatSheet}
            onConnectDrive={handleConnectDrive}
            onDriveSync={handleDriveSync}
            isSyncing={isSyncing}
            syncResult={syncResult}
            setSyncResult={setSyncResult}
          />
        )}

        {/* Tab 5: Uplink Inbox */}
        {activeTab === 'messages' && (
          <MessagesTab
            messagesList={messagesList}
            onMarkRead={handleMarkMessageRead}
            onDeleteMessage={handleDeleteMessage}
          />
        )}

        {/* Tab 6: Agent Handoffs & Communications */}
        {activeTab === 'agent_messages' && (
          <AgentMessagesTab
            agentMessages={agentMessages}
            agentStats={agentStats}
            onRefresh={loadAdminData}
            onUpdateStatus={handleUpdateAgentMessageStatus}
            onDeleteMessage={handleDeleteAgentMessage}
            onTransmit={handleTransmitAgentMessage}
            transmitForm={transmitForm}
            setTransmitForm={setTransmitForm}
            showTransmitModal={showTransmitModal}
            setShowTransmitModal={setShowTransmitModal}
          />
        )}

        {/* Tab 7: Organizational Matrix & Workspaces */}
        {activeTab === 'organization' && (
          <OrgMatrixTab
            terminalsList={terminalsList}
            agentStats={agentStats}
            onRefresh={loadAdminData}
            onSaveTerminal={handleSaveTerminal}
            onDeleteTerminal={handleDeleteTerminal}
            onSelectTerminalForInbox={(_terminalId) => {
              setActiveTab('agent_messages');
            }}
            adminFetch={adminFetch}
            showNotify={showNotify}
          />
        )}

        {/* Tab 8: Audit Log Stream & Rollback */}
        {activeTab === 'audit' && (
          <AuditLogsTab
            auditList={auditList}
            onRefresh={loadAdminData}
            onRollback={handleRollback}
          />
        )}

        {/* Tab 9: Security PIN & Registered Agent Tokens */}
        {activeTab === 'security' && (
          <SecurityPinTab 
            onUpdatePin={handleUpdatePin} 
            adminFetch={adminFetch}
            showNotify={showNotify}
          />
        )}
      </div>

      {/* Slide-in Help Panel */}
      <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
};

export default AdminDashboard;
