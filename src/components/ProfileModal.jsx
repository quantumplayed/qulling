import React, { useState, useEffect, useRef } from 'react';
import { X, User, Briefcase, Loader, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '../services/supabaseClient';

const ProfileModal = ({ isOpen, onClose, currentUser, onProfileUpdated }) => {
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setName(currentUser.name || '');
      setAffiliation(currentUser.affiliation || '');
      setError('');
      setSuccess('');
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase client not initialized.');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          affiliation: affiliation.trim(),
        })
        .eq('id', currentUser.id);

      if (updateError) throw updateError;

      setSuccess('Profile updated successfully.');
      onProfileUpdated({
        ...currentUser,
        name: name.trim(),
        affiliation: affiliation.trim(),
      });
      
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[500] overflow-y-auto flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="modal-card w-full max-w-lg max-h-[90vh] sm:max-h-none overflow-y-auto animate-in zoom-in-95 duration-200"
      >
        <button onClick={onClose} className="modal-close-btn">
          <X size={18} />
        </button>

        <div className="modal-body">
          <div className="text-center mb-8">
            <div className="modal-icon-badge mb-6">
              <User size={32} className="text-[#3ecf8e]" />
            </div>
            <h2 className="modal-title mb-3">Edit Profile</h2>
            <p className="modal-subtitle">
              Update your account details.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div className="modal-error">{error}</div>}
            {success && (
              <div className="p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 rounded-xl text-sm text-center flex items-center justify-center gap-2 font-medium">
                <ShieldCheck size={16} />
                {success}
              </div>
            )}

            <div className="modal-field">
              <label className="modal-label">Full Name</label>
              <div className="relative">
                <User size={18} className="modal-field-icon" />
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
                  className="modal-input modal-input-icon"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">Affiliation</label>
              <div className="relative">
                <Briefcase size={18} className="modal-field-icon" />
                <input
                  type="text"
                  placeholder="e.g. University of Science"
                  className="modal-input modal-input-icon"
                  value={affiliation}
                  onChange={(e) => setAffiliation(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="modal-btn-primary w-full"
              >
                {loading ? <Loader className="animate-spin" size={18} /> : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
