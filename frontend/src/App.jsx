import { useEffect, useState } from "react";

function App() {
  const [msg, setMsg] = useState("Connecting...");

  useEffect(() => {
    // Note: Replace with your Tailscale MagicDNS name later
    fetch("http://localhost:8000/api")
      .then((res) => res.json())
      .then((data) => setMsg(data.message))
      .catch(() => setMsg("Backend Unreachable"));
  }, []);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>{msg}</h1>
      <p>Hosted on Mini PC via Docker</p>
    </div>
  );
}

export default App;
