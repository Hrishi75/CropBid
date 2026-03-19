import { useEffect, useState } from 'react'

function App() {
  const [health, setHealth] = useState<string>('Checking...')

  useEffect(() => {
    // This call goes through Vite's proxy to Express on port 5000
    // In the browser, it's just /api/health — no port number needed!
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealth(data.status))
      .catch(() => setHealth('Server not running'))
  }, [])

  return (
    <div className="min-h-screen bg-surface-alt flex items-center justify-center">
      <div className="bg-surface rounded-2xl shadow-lg p-12 text-center max-w-md">
        {/* Logo / Title */}
        <h1 className="text-4xl font-bold text-primary mb-2">
          🌾 CropBid
        </h1>
        <p className="text-text-secondary text-lg mb-8">
          Where AI Agents Negotiate, So Farmers Prosper.
        </p>

        {/* Health check badge — confirms server connection via proxy */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-alt">
          <span className={`w-2.5 h-2.5 rounded-full ${
            health === 'ok' ? 'bg-accent animate-pulse' : 'bg-error'
          }`} />
          <span className="text-sm text-text-secondary">
            Server: <span className="font-medium text-text">{health}</span>
          </span>
        </div>

        {/* Tech stack info */}
        <div className="mt-8 grid grid-cols-2 gap-3 text-sm text-text-secondary">
          <div className="bg-surface-alt rounded-lg p-3">React + TypeScript</div>
          <div className="bg-surface-alt rounded-lg p-3">Tailwind CSS v4</div>
          <div className="bg-surface-alt rounded-lg p-3">Express + Node.js</div>
          <div className="bg-surface-alt rounded-lg p-3">PostgreSQL + Prisma</div>
        </div>
      </div>
    </div>
  )
}

export default App
