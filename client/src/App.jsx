import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('Loading server message...')
  const [echoResponse, setEchoResponse] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/message')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`)
        }
        return res.json()
      })
      .then((data) => {
        setMessage(data.message ?? 'No message field returned')
      })
      .catch((err) => {
        setError(err.message)
        setMessage('Unable to reach the server')
      })
  }, [])

  const handleSendEcho = async () => {
    try {
      setError(null)
      const response = await fetch('/api/echo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sentAt: Date.now(), note: 'Hello from the client!' }),
      })

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      const data = await response.json()
      setEchoResponse(data.received)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="app-shell">
      <header>
        <h1>DeLorean Demo</h1>
        <p className="tagline">Simple React + Express starter to unblock local dev</p>
      </header>

      <section className="panel">
        <h2>Server Message</h2>
        <p className="server-message">{message}</p>
        {error && <p className="error">Error: {error}</p>}
      </section>

      <section className="panel">
        <h2>POST /api/echo</h2>
        <button type="button" onClick={handleSendEcho}>
          Send echo payload
        </button>
        {echoResponse && (
          <pre className="echo-response">{JSON.stringify(echoResponse, null, 2)}</pre>
        )}
      </section>
    </main>
  )
}

export default App
