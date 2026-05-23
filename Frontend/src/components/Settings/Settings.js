import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import {
  clearAuthSession,
  createUser,
  deleteUser,
  getAuthSession,
  getUsers,
  setAuthSession,
  updateUser,
} from '../../api/authApi';
import { DEFAULT_APP_PERMISSIONS, loadAppPermissions, saveAppPermissions } from '../../api/permissionApi';
import '../AddCandidateModal/AddCandidateModal.css';
import './Settings.css';

const INITIAL_USER_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'hr',
};

const INITIAL_PASSWORD_FORM = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
};

function Settings() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [modalForm, setModalForm] = useState(INITIAL_USER_FORM);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalError, setModalError] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [profileModalError, setProfileModalError] = useState('');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState(INITIAL_PASSWORD_FORM);
  const [passwordError, setPasswordError] = useState('');
  const [permissions, setPermissions] = useState(DEFAULT_APP_PERMISSIONS);
  const [notifications, setNotifications] = useState([]);

  const addNotification = (text) => {
    const newNotif = {
      id: Date.now(),
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  useEffect(() => {
    const session = getAuthSession();
    if (!session) {
      navigate('/login');
      return;
    }

    setCurrentUser(session);
    setPermissions(loadAppPermissions());

    if (session.role === 'director') {
      fetchUsers();
    }
  }, [navigate]);

  const fetchUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data || []);
    } catch (err) {
      console.error('Unable to load users', err);
    }
  };

  const openAddModal = () => {
    setModalMode('add');
    setModalForm(INITIAL_USER_FORM);
    setSelectedUser(null);
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setModalMode('edit');
    setSelectedUser(user);
    setModalForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'user',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const openProfileModal = () => {
    setProfileForm({ name: currentUser?.name || '', email: currentUser?.email || '' });
    setProfileModalError('');
    setIsProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
    setProfileModalError('');
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSave = async () => {
    setProfileModalError('');
    if (!profileForm.name || !profileForm.email) {
      setProfileModalError('Name and email are required.');
      return;
    }

    try {
      await updateUser({
        id: currentUser.id,
        name: profileForm.name,
        email: profileForm.email,
        role: currentUser.role,
        requesterEmail: currentUser.email,
        requesterPassword: currentUser.password,
      });

      addNotification('Profile updated successfully.');

      const nextSession = {
        ...currentUser,
        name: profileForm.name,
        email: profileForm.email,
      };
      setAuthSession(nextSession);
      setCurrentUser(nextSession);

      setTimeout(() => closeProfileModal(), 400);
    } catch (err) {
      setProfileModalError(err.message || 'Unable to update profile.');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalError('');
  };

  const handleModalChange = (e) => {
    const { name, value } = e.target;
    setModalForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleModalSave = async () => {
    setModalError('');

    const isAddMode = modalMode === 'add';
    const isEditingOtherUser = selectedUser && currentUser && selectedUser.id !== currentUser.id;

    if (isAddMode && (!currentUser || currentUser.role !== 'director')) {
      setModalError('Only a director can add users.');
      return;
    }

    if (isEditingOtherUser && (!currentUser || currentUser.role !== 'director')) {
      setModalError('Only a director can edit other users.');
      return;
    }

    if (!modalForm.name || !modalForm.email) {
      setModalError('Name and email are required.');
      return;
    }

    const defaultPassword = 'changeme@123';
    const newPassword = isAddMode ? (modalForm.password || defaultPassword) : modalForm.password;

    try {
      if (isAddMode) {
        await createUser({
          name: modalForm.name,
          email: modalForm.email,
          password: newPassword,
          role: modalForm.role,
          createdByEmail: currentUser.email,
          createdByPassword: currentUser.password,
        });
        addNotification(`Created ${modalForm.role.toUpperCase()} ${modalForm.name}.`);
      } else if (selectedUser) {
        const updateData = {
          id: selectedUser.id,
          name: modalForm.name,
          email: modalForm.email,
          role: modalForm.role,
          requesterEmail: currentUser.email,
          requesterPassword: currentUser.password,
        };
        if (modalForm.password) {
          updateData.password = modalForm.password;
        }

        await updateUser(updateData);
        addNotification(`Updated ${modalForm.name}.`);
        if (currentUser.id === selectedUser.id) {
          const nextSession = {
            ...currentUser,
            name: modalForm.name,
            email: modalForm.email,
            role: modalForm.role,
            password: modalForm.password || currentUser.password,
          };
          setAuthSession(nextSession);
          setCurrentUser(nextSession);
        }
      }

      closeModal();
      await fetchUsers();
    } catch (err) {
      setModalError(err.message || 'Unable to save user.');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!currentUser || currentUser.role !== 'director') {
      addNotification('Only a director can delete users.');
      return;
    }

    try {
      await deleteUser({
        id,
        requesterEmail: currentUser.email,
        requesterPassword: currentUser.password,
      });
      addNotification('User deleted successfully.');
      await fetchUsers();
    } catch (err) {
      addNotification(err.message || 'Unable to delete user.');
    }
  };

  const togglePermission = (key) => {
    if (!currentUser || currentUser.role !== 'director') {
      addNotification('Only directors can change feature permissions.');
      return;
    }

    const nextPermissions = {
      ...permissions,
      [key]: !permissions[key],
    };
    saveAppPermissions(nextPermissions);
    setPermissions(nextPermissions);
    addNotification('Permission updated successfully.');
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate('/home');
  };

  const openPasswordModal = () => {
    setPasswordForm(INITIAL_PASSWORD_FORM);
    setPasswordError('');
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setPasswordError('');
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordSave = async () => {
    setPasswordError('');
    

    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All fields are required.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }

    if (passwordForm.oldPassword === passwordForm.newPassword) {
      setPasswordError('New password cannot be the same as old password.');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    try {
      // Update user with new password
      await updateUser({
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        password: passwordForm.newPassword,
        role: currentUser.role,
        requesterEmail: currentUser.email,
        requesterPassword: passwordForm.oldPassword, // Use old password to verify
      });

      addNotification('Password changed successfully.');
      
      // Update session with new password
      const nextSession = {
        ...currentUser,
        password: passwordForm.newPassword,
      };
      setAuthSession(nextSession);
      setCurrentUser(nextSession);

      setTimeout(() => {
        closePasswordModal();
      }, 2000);
    } catch (err) {
      setPasswordError(err.message || 'Unable to change password. Please check your old password.');
    }
  };

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />

      <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <TopBar
          toggleSidebar={toggleSidebar}
          notifications={notifications}
          clearNotifications={clearNotifications}
        />

        <main className="settings-main">
          <div className="settings-header">
            <div>
              <h2 className='heading-title'>Settings</h2>
            </div>
        
          </div>

         
          {/* Current User Profile Section */}
          <section className="settings-panel settings-profile-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>Your Profile</h3>
                <p style={{ color: '#666', margin: '8px 0 0' }}>
                  {currentUser?.name} ({currentUser?.email})
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button" 
                  onClick={openProfileModal}
                  className="btn-edit"
                >
                  Edit Profile
                </button>
                <button 
                  type="button" 
                  onClick={openPasswordModal}
                  className="btn-change-password"
                >
                  Change Password
                </button>
              </div>
            </div>
          </section>                                                            

      
                  
          {currentUser?.role === 'director' && (
            <section className="settings-panel settings-table-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <h3>All Users</h3>
                <button type="button" onClick={openAddModal} style={{ minWidth: 140 }}>
                  Add User
                </button>
              </div>
              {/* notifications moved to TopBar */}
              <div className="settings-table-wrapper">
                <table className="settings-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Created</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>{user.createdAt?.split('T')[0] || '-'}</td>
                        <td>{user.updatedAt?.split('T')[0] || '-'}</td>
                        <td className="settings-actions-cell">
                          <button type="button" onClick={() => handleDeleteUser(user.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan="6">No users available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

           {currentUser?.role === 'director' && (
            <section className="settings-panel settings-permissions-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3>Permission Controls</h3>
                  <p style={{ margin: '8px 0 0', color: '#4b5563' }}>
                    Toggle global application actions for all roles.
                  </p>
                </div>
              </div>

              <div className="permission-grid">
                <div className="permission-item">
                  <div>
                    <strong>Stop Add Candidate</strong>
                    <p>Hide the candidate creation button across the app.</p>
                  </div>
                  <button
  type="button"
  className={`toggle-btn ${permissions.allowAddCandidate ? 'active' : 'disabled'}`}
  onClick={() => togglePermission('allowAddCandidate')}
/>
                </div>

                <div className="permission-item">
                  <div>
                    <strong>Stop Add Job</strong>
                    <p>Hide the job creation button across the app.</p>
                  </div>
<button
  type="button"
  className={`toggle-btn ${permissions.allowAddJob ? 'active' : 'disabled'}`}
  onClick={() => togglePermission('allowAddJob')}
/>
                </div>

                <div className="permission-item">
                  <div>
                    <strong>Stop AI Service</strong>
                    <p>Disable access to the AI Assistant for all users.</p>
                  </div>
<button
  type="button"
  className={`toggle-btn ${permissions.allowAIService ? 'active' : 'disabled'}`}
  onClick={() => togglePermission('allowAIService')}
/>
                </div>
              </div>

              {/* permission updates surface via TopBar notifications */}
            </section>
          )}


          <section className="settings-panel1 ettings-logout-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>Logout</h3> 
                <p style={{ margin: '8px 0 0', color: '#4b5563' }}>
                  End your current session safely.
                </p>
              </div>
              <button className="settings-logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </section>

          {isModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>{modalMode === 'add' ? 'Add User' : 'Edit User'}</h3>

                <div className="modal-form">
                  <input
                    type="text"
                    name="name"
                    placeholder="Full Name"
                    value={modalForm.name}
                    onChange={handleModalChange}
                  />

                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={modalForm.email}
                    onChange={handleModalChange}
                  />
<select
  name="role"
  value={modalForm.role}
  onChange={handleModalChange}
  className="role-select"
>
  <option value="hr">HR</option>
  <option value="manager">Manager</option>
  <option value="director">Director</option>
  <option value="user">User</option>
</select>

                  {modalError && <p style={{ color: '#b91c1c', margin: 0 }}>{modalError}</p>}

                  <div className="modal-actions">
                    <button type="button" className="btn-cancel" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="button" className="btn-submit" onClick={handleModalSave}>
                      {modalMode === 'add' ? 'Add User' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

  {isProfileModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>Edit Profile</h3>

                <div className="modal-form">
                  <input
                    type="text"
                    name="name"
                    placeholder="Full Name"
                    value={profileForm.name}
                    onChange={handleProfileChange}
                  />

                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={profileForm.email}
                    onChange={handleProfileChange}
                  />

                  {profileModalError && <p style={{ color: '#b91c1c', margin: 0 }}>{profileModalError}</p>}

                  <div className="modal-actions">
                    <button type="button" className="btn-cancel" onClick={closeProfileModal}>
                      Cancel
                    </button>
                    <button type="button" className="btn-submit" onClick={handleProfileSave}>
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Change Password Modal */}
          {isPasswordModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>Change Password</h3>

                <div className="modal-form">
                  <input
                    type="password"
                    name="oldPassword"
                    placeholder="Old Password"
                    value={passwordForm.oldPassword}
                    onChange={handlePasswordChange}
                  />

                  <input
                    type="password"
                    name="newPassword"
                    placeholder="New Password"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                  />

                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm New Password"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                  />

                  {passwordError && <p style={{ color: '#b91c1c', margin: '8px 0' }}>{passwordError}</p>}

                  <div className="modal-actions">
                    <button type="button" className="btn-cancel" onClick={closePasswordModal}>
                      Cancel
                    </button>
                    <button type="button" className="btn-submit" onClick={handlePasswordSave}>
                      Change Password
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Settings;
