"use client";

import React, { useState, useEffect } from 'react';

// lucide-react isn't installed in this environment; use simple placeholders typed as any to avoid TS errors
const IconPlaceholder = (props: any) => null as any;
const Search: any = IconPlaceholder;
const Database: any = IconPlaceholder;
const Play: any = IconPlaceholder;
const RefreshCw: any = IconPlaceholder;
const Trash2: any = IconPlaceholder;
const Eye: any = IconPlaceholder;
const Copy: any = IconPlaceholder;
const CheckCircle: any = IconPlaceholder;
const AlertCircle: any = IconPlaceholder;
const Clock: any = IconPlaceholder;

type Notification = { message: string; type?: 'success' | 'error' } | null;

type SnapshotData = {
    snapshotId?: string;
    status?: string;
    success?: boolean;
    data?: any[];
    dataCount?: number;
};

const BrightDataDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<string>('job-search');
    const [loading, setLoading] = useState<boolean>(false);
    const [results, setResults] = useState<any | null>(null);
    const [snapshots, setSnapshots] = useState<string[]>([]);
    const [snapshotData, setSnapshotData] = useState<Record<string, SnapshotData>>({});
    const [notification, setNotification] = useState<Notification>(null);

    // Job Search Form State
    const [jobForm, setJobForm] = useState({
        keyword: 'public health jobs',
        location: 'Chennai, Bangalore',
        country: 'IN',
        platform: 'linkedin' // New field to choose platform
    });

    // Show notification
    const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // Copy to clipboard
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showNotification('Copied to clipboard!');
    };

    // API call wrapper
    const apiCall = async (url: string, options: RequestInit & { headers?: Record<string, string> } = {}) => {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error: unknown) {
            console.error('API call failed:', error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    };

    // Trigger job search
    const triggerJobSearch = async (): Promise<void> => {
        setLoading(true);
        try {
            // Determine the type based on platform selection
            let requestType = 'job_search'; // Default to LinkedIn only
            if (jobForm.platform === 'both') {
                requestType = 'both_platforms';
            }

            const result = await apiCall('/api/brightdata-webhook', {
                method: 'POST',
                body: JSON.stringify({
                    type: requestType,
                    keyword: jobForm.keyword,
                    location: jobForm.location,
                    country: jobForm.country
                })
            });

            setResults(result);

            if (jobForm.platform === 'both') {
                showNotification('Both LinkedIn and Indeed jobs triggered successfully!');
            } else {
                showNotification('LinkedIn job search triggered successfully!');
            }

            // Refresh snapshots to show new data
            loadSnapshots();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            showNotification(`Error: ${msg}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load snapshots
    const loadSnapshots = async (): Promise<void> => {
        try {
            const result = await apiCall('/api/webhook-data?action=list');
            setSnapshots(result.snapshots || []);
        } catch (error) {
            console.error('Failed to load snapshots:', error);
        }
    };

    // Load snapshot data
    const loadSnapshotData = async (snapshotId: string): Promise<void> => {
        setLoading(true);
        try {
            const result = await apiCall(`/api/webhook-data?snapshotId=${snapshotId}`);
            setSnapshotData(prev => ({
                ...prev,
                [snapshotId]: result
            }));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            showNotification(`Failed to load data for ${snapshotId}: ${msg}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Delete snapshot
    const deleteSnapshot = async (snapshotId: string): Promise<void> => {
        if (!confirm(`Are you sure you want to delete snapshot ${snapshotId}?`)) return;

        try {
            await apiCall(`/api/webhook-data?snapshotId=${snapshotId}`, {
                method: 'DELETE'
            });

            showNotification(`Snapshot ${snapshotId} deleted successfully!`);
            loadSnapshots();

            // Remove from local state
            setSnapshotData(prev => {
                const newData: Record<string, SnapshotData> = { ...prev };
                delete newData[snapshotId];
                return newData;
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            showNotification(`Failed to delete snapshot: ${msg}`, 'error');
        }
    };

    // Load snapshots on component mount
    useEffect(() => {
        loadSnapshots();
    }, []);

    const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
        const getStatusColor = (status: string) => {
            switch (status) {
                case 'ready':
                case 'completed':
                    return 'bg-green-100 text-green-800';
                case 'failed':
                    return 'bg-red-100 text-red-800';
                case 'triggered':
                case 'running':
                    return 'bg-blue-100 text-blue-800';
                default:
                    return 'bg-gray-100 text-gray-800';
            }
        };

        const getStatusIcon = (status: string) => {
            switch (status) {
                case 'ready':
                case 'completed':
                    return <CheckCircle className="w-3 h-3" />;
                case 'failed':
                    return <AlertCircle className="w-3 h-3" />;
                default:
                    return <Clock className="w-3 h-3" />;
            }
        };

        return (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                {getStatusIcon(status)}
                {status}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">BrightData Dashboard</h1>
                    <p className="text-gray-600">Trigger job searches and manage webhook data</p>
                </div>

                {/* Notification */}
                {notification && (
                    <div className={`mb-6 p-4 rounded-lg ${notification.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
                        <div className="flex items-center gap-2">
                            {notification.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            {notification.message}
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="bg-white rounded-lg shadow-sm mb-6">
                    <div className="border-b border-gray-200">
                        <nav className="flex space-x-8 px-6">
                            {[
                                { id: 'job-search', label: 'Job Search', icon: Search },
                                { id: 'data', label: 'Webhook Data', icon: Database }
                            ].map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${activeTab === id
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="p-6">
                        {/* Job Search Tab */}
                        {activeTab === 'job-search' && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Job Search</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Keyword</label>
                                            <input
                                                type="text"
                                                value={jobForm.keyword}
                                                onChange={(e) => setJobForm(prev => ({ ...prev, keyword: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g., public health jobs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                                            <input
                                                type="text"
                                                    value={jobForm.location}
                                                    onChange={(e) => setJobForm(prev => ({ ...prev, location: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g., Chennai, Bangalore, Mumbai, Delhi"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Enter multiple locations separated by commas
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                                            <select
                                                value={jobForm.country}
                                                onChange={(e) => setJobForm(prev => ({ ...prev, country: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="IN">India</option>
                                                <option value="US">United States</option>
                                                <option value="UK">United Kingdom</option>
                                                <option value="CA">Canada</option>
                                                <option value="AU">Australia</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
                                            <select
                                                value={jobForm.platform}
                                                onChange={(e) => setJobForm(prev => ({ ...prev, platform: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="linkedin">LinkedIn Only</option>
                                                <option value="both">Both LinkedIn & Indeed</option>
                                            </select>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Choose LinkedIn only or scrape both platforms simultaneously
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={triggerJobSearch}
                                        disabled={loading}
                                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                        {loading ? 'Triggering...' : 'Trigger Job Search'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Webhook Data Tab */}
                        {activeTab === 'data' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-semibold text-gray-900">Webhook Data</h2>
                                    <button
                                        onClick={loadSnapshots}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Refresh
                                    </button>
                                </div>

                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Eye className="w-5 h-5 text-blue-600" />
                                        <span className="font-medium text-blue-900">Webhook Monitor</span>
                                    </div>
                                    <p className="text-blue-800 text-sm mb-2">
                                        Monitor incoming webhooks at:
                                        <button
                                            onClick={() => copyToClipboard('https://webhook.site/#!/a640096a-2c0a-4b6e-9b9d-5698098181bc')}
                                            className="ml-2 text-blue-600 hover:text-blue-800 underline"
                                        >
                                            https://webhook.site/#!/a640096a-2c0a-4b6e-9b9d-5698098181bc
                                        </button>
                                    </p>
                                </div>

                                {snapshots.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No webhook data found</p>
                                        <p className="text-sm">Trigger a job search to see data here</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {snapshots.map(snapshotId => {
                                            const data = snapshotData[snapshotId];
                                            return (
                                                <div key={snapshotId} className="border border-gray-200 rounded-lg p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                                                {snapshotId}
                                                            </span>
                                                            {data?.success && <StatusBadge status={data.status || 'unknown'} />}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => copyToClipboard(snapshotId)}
                                                                className="p-1 text-gray-400 hover:text-gray-600"
                                                                title="Copy Snapshot ID"
                                                            >
                                                                <Copy className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => loadSnapshotData(snapshotId)}
                                                                className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                                View
                                                            </button>
                                                            <button
                                                                onClick={() => deleteSnapshot(snapshotId)}
                                                                className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {data && (
                                                        <div className="bg-gray-50 rounded p-3 mt-3">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                                <div>
                                                                    <span className="text-gray-600">Status:</span>
                                                                    <div className="mt-1">
                                                                        <StatusBadge status={data.status || 'unknown'} />
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-600">Data Count:</span>
                                                                    <div className="font-medium">{data.dataCount || 0}</div>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-600">Found:</span>
                                                                    <div className="font-medium">{data.success ? 'Yes' : 'No'}</div>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-600">Snapshot ID:</span>
                                                                    <div className="font-mono text-xs">{data.snapshotId}</div>
                                                                </div>
                                                            </div>

                                                            {data.data && data.data.length > 0 && (
                                                                <div className="mt-4">
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                                                                            Show Data Preview ({data.data.length} records)
                                                                        </summary>
                                                                        <div className="mt-2 max-h-60 overflow-auto">
                                                                            <pre className="text-xs bg-white p-3 rounded border">
                                                                                {JSON.stringify(data.data.slice(0, 3), null, 2)}
                                                                                {data.data.length > 3 && '\n... and more'}
                                                                            </pre>
                                                                        </div>
                                                                    </details>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Results Display */}
                {results && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Latest Result</h3>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <pre className="text-sm overflow-auto">
                                {JSON.stringify(results, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BrightDataDashboard;