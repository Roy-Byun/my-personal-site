import { useEffect, useState } from "react";

function App() {
  const [msg, setMsg] = useState("Connecting...");

  useEffect(() => {
    fetch("http://100.106.207.88:8000/api")
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
