import React, { useState } from 'react';
import MongoLogo from './MongoLogo';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    organization_name: '',
    customer_name: '',
    email: '',
    spoc_email: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 shadow-2xl">
          <div className="flex items-center justify-center mb-6">
            <MongoLogo size={56} />
          </div>
          
          <h1 className="text-3xl font-heading font-semibold text-center mb-2 text-slate-50">
            MongoDB Certification Program
          </h1>
          <p className="text-center text-xs font-mono uppercase tracking-[0.2em] text-emerald-400 mb-2">
            MCP
          </p>
          <p className="text-center text-slate-400 mb-8">
            Sign in to view training courses and live seat availability
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="organization_name" className="block text-sm font-medium text-slate-300 mb-2">
                Organization Name
              </label>
              <input
                id="organization_name"
                name="organization_name"
                type="text"
                required
                data-testid="login-organization-input"
                className="w-full bg-slate-950 border border-slate-800 text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md px-4 py-2 outline-none transition-all"
                placeholder="Enter your organization name"
                value={formData.organization_name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="customer_name" className="block text-sm font-medium text-slate-300 mb-2">
                Your Name
              </label>
              <input
                id="customer_name"
                name="customer_name"
                type="text"
                required
                data-testid="login-name-input"
                className="w-full bg-slate-950 border border-slate-800 text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md px-4 py-2 outline-none transition-all"
                placeholder="Enter your name"
                value={formData.customer_name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                data-testid="login-email-input"
                className="w-full bg-slate-950 border border-slate-800 text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md px-4 py-2 outline-none transition-all"
                placeholder="your.email@company.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="spoc_email" className="block text-sm font-medium text-slate-300 mb-2">
                MongoDB SPOC Email
              </label>
              <input
                id="spoc_email"
                name="spoc_email"
                type="email"
                required
                data-testid="login-spoc-email-input"
                className="w-full bg-slate-950 border border-slate-800 text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md px-4 py-2 outline-none transition-all"
                placeholder="spoc@mongodb.com"
                value={formData.spoc_email}
                onChange={handleChange}
              />
              <p className="mt-1 text-xs text-slate-500">
                Your MongoDB representative&apos;s email address
              </p>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 px-4 py-3 rounded-md text-sm" data-testid="login-error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium px-6 py-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Not registered? Please contact your MongoDB representative to get access.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
