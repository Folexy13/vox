import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import VoiceSetup from './pages/VoiceSetup';
import CallRoom from './pages/CallRoom';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-google-dark text-white selection:bg-google-blue/30">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup/:roomId" element={<VoiceSetup />} />
          <Route path="/call/:roomId" element={<CallRoom />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
