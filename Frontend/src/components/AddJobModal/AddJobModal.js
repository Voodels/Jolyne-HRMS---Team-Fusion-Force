import { useState, useEffect } from 'react';
import './AddJobModal.css'; // reuse same CSS

function AddJobModal({ isOpen, onClose, onAdd, currentUser }) {
  const [form, setForm] = useState({
    title: '',
    manager: '',
    file: null,
  });

  // Auto-fill manager when modal opens and currentUser is available
  useEffect(() => {
    if (isOpen && currentUser?.name) {
      setForm(prev => ({
        ...prev,
        manager: currentUser.name,
      }));
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, files } = e.target;

    if (name === 'file') {
      setForm({ ...form, file: files[0] });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const newJob = {
      id: Date.now(),
      title: form.title,
      manager: form.manager,
      fileName: form.file?.name || 'job.pdf',
      lastUpdated: new Date().toISOString().split('T')[0],
    };

    onAdd(newJob);
    setForm({ title: '', manager: '', file: null });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Add Job</h3>

        <form onSubmit={handleSubmit} className="modal-form">

          <input
            type="text"
            name="title"
            placeholder="Job Title"
            value={form.title}
            required
            onChange={handleChange}
          />

          <input
            type="text"
            name="manager"
            placeholder="Hiring Manager"
            value={form.manager}
            required
            onChange={handleChange}
          />

          <input
            type="file"
            name="file"
            accept=".pdf"
            onChange={handleChange}
          />

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>

            <button type="submit" className="btn-submit">
              Add Job
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default AddJobModal;