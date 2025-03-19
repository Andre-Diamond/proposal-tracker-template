// src/pages/index.tsx
import { useEffect, useState } from 'react';

interface Project {
  project_id: string;
  name?: string;
  status?: string;
  budget?: string;
}

interface Milestone {
  title: string;
  status: string;
  due_date: string;
  [key: string]: string;
}

interface Transaction {
  date: string;
  amount: string;
  type: string;
  [key: string]: string;
}

interface Financial {
  total_budget: string;
  spent: string;
  remaining: string;
  [key: string]: string;
}

interface ProjectData extends Omit<Project, 'project_id'> {
  project_id: string;
  milestones: Milestone[];
  transactions: Transaction[];
  financials: Financial;
}

export default function Home() {
  const [projectsData, setProjectsData] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjectData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/projects');
        if (!response.ok) {
          throw new Error('Failed to fetch project data');
        }
        const data = await response.json();
        setProjectsData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching project data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, []);

  return (
    <div className="home-container p-4">
      <h1 className="text-2xl font-bold mb-4">Project Dashboard</h1>

      {loading && <p className="text-gray-600">Loading project data...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      {projectsData.length > 0 && (
        <div className="space-y-6">
          {projectsData.map((project) => (
            <div key={project.project_id} className="border rounded-lg p-4 shadow">
              <h2 className="text-xl font-semibold mb-2">Project {project.project_id}</h2>

              {/* Project Details */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <h3 className="font-medium">Project Details</h3>
                  <p>Name: {project.name || 'N/A'}</p>
                  <p>Status: {project.status || 'N/A'}</p>
                  <p>Budget: {project.budget || 'N/A'}</p>
                </div>

                {/* Financials */}
                <div>
                  <h3 className="font-medium">Financial Summary</h3>
                  <p>Total Budget: {project.financials?.total_budget || 'N/A'}</p>
                  <p>Spent: {project.financials?.spent || 'N/A'}</p>
                  <p>Remaining: {project.financials?.remaining || 'N/A'}</p>
                </div>
              </div>

              {/* Milestones */}
              <div className="mt-4">
                <h3 className="font-medium mb-2">Milestones</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-2">Title</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.milestones.map((milestone: Milestone, index: number) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-2">{milestone.title || 'N/A'}</td>
                          <td className="px-4 py-2">{milestone.status || 'N/A'}</td>
                          <td className="px-4 py-2">{milestone.due_date || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Transactions */}
              <div className="mt-4">
                <h3 className="font-medium mb-2">Recent Transactions</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Amount</th>
                        <th className="px-4 py-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.transactions.map((tx: Transaction, index: number) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-2">{tx.date || 'N/A'}</td>
                          <td className="px-4 py-2">{tx.amount || 'N/A'}</td>
                          <td className="px-4 py-2">{tx.type || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
