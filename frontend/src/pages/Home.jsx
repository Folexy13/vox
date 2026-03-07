import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Keyboard, Plus, Sparkles, MessageSquare, Zap, Globe } from 'lucide-react';
import Modal from '../components/Modal';
import { useGlobalAudio } from '../context/AudioContext';

const Home = () => {
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const navigate = useNavigate();
  const { unlock } = useGlobalAudio();

  const showModal = (type, title, message) => {
    setModal({ isOpen: true, type, title, message });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const handleStartCall = async () => {
    setLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/rooms`, { method: 'POST' });
      const data = await response.json();
      navigate(`/setup/${data.room_id}`);
    } catch (err) {
      console.error("Failed to create meeting session", err);
      showModal('error', 'Connection Failed', 'Could not connect to neural engine. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinCall = async (e) => {
    e.preventDefault();
    if (!roomCode) return;
    
    setLoading(true);
    let cleanCode = roomCode.trim();
    if (cleanCode.includes('/')) {
      cleanCode = cleanCode.split('/').pop();
    }
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/rooms/${cleanCode}/verify`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.user_count >= 2) {
          showModal('warning', 'Meeting Full', 'This meeting is full. Maximum 2 participants allowed.');
          return;
        }
        navigate(`/setup/${cleanCode}`);
      } else {
        showModal('error', 'Meeting Not Found', 'The meeting ID you entered does not exist.');
      }
    } catch (err) {
      showModal('error', 'Connection Error', 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#050505] text-white overflow-hidden relative selection:bg-google-blue/30">
      {/* Modal */}
      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
      />

      {/* Animated Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-google-blue/20 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-google-red/10 rounded-full blur-[120px] animate-pulse delay-700 pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-google-yellow/10 rounded-full blur-[100px] animate-pulse delay-1000 pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10">
        
        {/* Left Content */}
        <div className="flex flex-col space-y-8 text-center lg:text-left animate-in fade-in slide-in-from-left-8 duration-1000">
          <div className="inline-flex items-center self-center lg:self-start space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-google-blue backdrop-blur-md mb-2 group cursor-default">
            <Zap className="w-4 h-4 fill-google-blue animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase">Gemini Multimodal Live Active</span>
          </div>
          
          <h1 className="text-7xl md:text-8xl font-black tracking-tighter leading-[0.9] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 italic">
            VOX<span className="text-google-blue font-light not-italic">.</span>
          </h1>
          
          <p className="text-2xl md:text-3xl font-light text-gray-400 leading-tight">
            Universal speech, <br/>
            <span className="text-white font-medium italic underline decoration-google-blue/50 decoration-4 underline-offset-8">zero barriers.</span>
          </p>
          
          <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4 pt-4">
            <button
              onClick={async () => {
                await unlock();
                navigate('/agent/' + Math.random().toString(36).substring(7));
              }}
              className="group relative flex items-center justify-center bg-gradient-to-br from-google-yellow to-orange-500 text-black px-10 py-5 rounded-2xl font-black text-lg transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(251,188,4,0.3)]"
            >
              <Sparkles className="w-6 h-6 mr-3 fill-black animate-spin-slow" />
              TALK TO AI AGENT
              <div className="absolute inset-0 rounded-2xl bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
            </button>

            <button
              onClick={async () => {
                await unlock();
                handleStartCall();
              }}
              disabled={loading}
              className="flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 text-white px-8 py-5 rounded-2xl font-bold text-lg transition-all hover:scale-105 active:scale-95 backdrop-blur-xl"
            >
              <Video className="w-5 h-5 mr-3" />
              {loading ? 'Starting...' : 'Create Meeting'}
            </button>
          </div>

          <div className="pt-8 flex flex-col space-y-4">
            <p className="text-sm text-gray-500 uppercase tracking-widest font-bold">Or Join Existing</p>
            <form onSubmit={handleJoinCall} className="flex max-w-md mx-auto lg:mx-0 relative group">
              <input
                type="text"
                placeholder="Enter room ID"
                className="block w-full pl-6 pr-24 py-5 border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-google-blue/50 transition-all"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
              />
              <button 
                type="submit"
                disabled={!roomCode || loading}
                className="absolute right-2 top-2 bottom-2 px-6 bg-white/10 hover:bg-white/20 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-20"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        {/* Right Content - Visualizer */}
        <div className="hidden lg:flex justify-center items-center animate-in fade-in zoom-in duration-1000 delay-300">
          <div className="relative w-[500px] h-[500px]">
            {/* Spinning Rings */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/5 animate-[spin_60s_linear_infinite]" />
            <div className="absolute inset-8 rounded-full border border-white/10 animate-[spin_40s_linear_infinite_reverse]" />
            <div className="absolute inset-16 rounded-full border-4 border-double border-google-blue/20 animate-[spin_20s_linear_infinite]" />
            
            {/* The Core Orb */}
            <div className="absolute inset-32 rounded-full bg-gradient-to-tr from-google-blue/40 via-google-red/40 to-google-yellow/40 blur-2xl animate-pulse" />
            <div className="absolute inset-32 rounded-full bg-black/40 backdrop-blur-3xl border border-white/20 flex items-center justify-center shadow-[0_0_100px_rgba(255,255,255,0.1)] overflow-hidden group">
              <div className="text-[14rem] font-black italic tracking-tighter text-white/10 group-hover:text-google-blue/40 transition-colors duration-1000">
                V
              </div>
              <div className="absolute bottom-12 flex space-x-1 items-end h-8">
                {[...Array(8)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1.5 bg-google-blue rounded-full animate-bar-bounce"
                    style={{ animationDelay: `${i * 0.1}s`, height: `${Math.random() * 100}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-10 flex flex-wrap justify-center gap-8 text-[10px] uppercase tracking-[0.3em] font-black text-gray-600">
        <div className="flex items-center space-x-2">
          <Globe className="w-3 h-3" />
          <span>Real-time Neural Translation</span>
        </div>
        <div className="flex items-center space-x-2 text-google-blue">
          <Zap className="w-3 h-3 fill-google-blue" />
          <span>Ultra-Low Latency Pipeline</span>
        </div>
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-3 h-3" />
          <span>Multimodal Context Awareness</span>
        </div>
      </div>
    </div>
  );
};

export default Home;
