import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import VoiceSetup from './pages/VoiceSetup';
import CallRoom from './pages/CallRoom';
import AgentRoom from './pages/AgentRoom';
import { AudioProvider } from './context/AudioContext';

function App() {
  return (
    <AudioProvider>
      <Router>
        <div className="min-h-screen bg-google-dark text-white selection:bg-google-blue/30">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/setup/:roomId" element={<VoiceSetup />} />
            <Route path="/call/:roomId" element={<CallRoom />} />
            <Route path="/agent/:roomId" element={<AgentRoom />} />
          </Routes>
        </div>
      </Router>
    </AudioProvider>
  );
}

export default App;
