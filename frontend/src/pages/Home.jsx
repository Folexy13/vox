import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Keyboard, Plus, Sparkles } from 'lucide-react';
import Modal from '../components/Modal';

const Home = () => {
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const navigate = useNavigate();

  const showModal = (type, title, message) => {
    setModal({ isOpen: true, type, title, message });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const handleStartCall = async () => {
    setLoading(true);
    try {
      const host = window.location.hostname;
      const response = await fetch(`http://${host}:8001/api/rooms`, { method: 'POST' });
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
    // Extract room code from URL or direct input
    let cleanCode = roomCode.trim();
    if (cleanCode.includes('/')) {
      cleanCode = cleanCode.split('/').pop();
    }
    // Remove any query params
    if (cleanCode.includes('?')) {
      cleanCode = cleanCode.split('?')[0];
    }
    
    try {
      const host = window.location.hostname;
      const response = await fetch(`http://${host}:8001/api/rooms/${cleanCode}/verify`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.user_count >= 2) {
          showModal('warning', 'Meeting Full', 'This meeting is full. Maximum 2 participants allowed.');
          return;
        }
        navigate(`/setup/${cleanCode}`);
      } else if (response.status === 404) {
        showModal('error', 'Meeting Not Found', 'The meeting ID you entered does not exist. Please check the ID or create a new meeting.');
      } else {
        showModal('error', 'Verification Failed', 'Could not verify the meeting. Please try again.');
      }
    } catch (err) {
      console.error("Verification failed", err);
      showModal('error', 'Connection Error', 'Could not connect to server. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row items-center justify-center p-8 bg-[#121212] overflow-hidden relative">
      {/* Modal */}
      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
      />

      {/* Background blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-google-blue/10 rounded-full blur-[120px] -mr-48 -mt-48 animate-pulse" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-google-red/5 rounded-full blur-[120px] -ml-48 -mb-48" />

      <div className="md:w-1/2 flex flex-col space-y-8 z-10 animate-in fade-in slide-in-from-left-8 duration-1000">
        <div className="flex items-center space-x-3 text-google-blue">
          <Sparkles className="w-6 h-6 fill-google-blue" />
          <span className="font-bold tracking-[0.3em] uppercase text-sm">Neural Engine Active</span>
        </div>
        
        <h1 className="text-6xl md:text-7xl font-light text-white leading-[1.1] tracking-tight">
          Vox: Your voice. <br/>
          <span className="bg-gradient-to-r from-google-blue via-google-red to-google-yellow bg-clip-text text-transparent font-medium">
            Any language.
          </span><br/>
          Real time.
        </h1>
        
        <p className="text-xl text-gray-400 max-w-lg leading-relaxed font-light">
          Experience natural conversation across any language barrier with Gemini-powered neural resynthesis.
        </p>
        
        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6 pt-6">
          <button 
            onClick={handleStartCall}
            disabled={loading}
            className="flex items-center justify-center bg-google-blue hover:bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-2xl shadow-google-blue/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
          >
            <Video className="w-5 h-5 mr-3" />
            {loading ? 'Creating...' : 'New meeting'}
          </button>
          
          <form onSubmit={handleJoinCall} className="flex flex-1 max-w-sm relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Keyboard className="h-5 w-5 text-gray-500 group-focus-within:text-google-blue transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Enter meeting ID"
              disabled={loading}
              className="block w-full pl-12 pr-20 py-4 border border-white/10 bg-white/5 backdrop-blur-md rounded-2xl leading-5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-google-blue/50 focus:border-google-blue transition-all disabled:opacity-50"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
            />
            <button 
              type="submit"
              disabled={!roomCode || loading}
              className={`absolute right-2 top-2 bottom-2 px-4 rounded-xl font-bold transition-all ${roomCode ? 'text-google-blue hover:bg-google-blue/10' : 'text-gray-600 cursor-not-allowed'}`}
            >
              {loading ? '...' : 'Join'}
            </button>
          </form>
        </div>
        
        <div className="pt-10 border-t border-white/5 max-w-lg text-sm text-gray-500 flex items-center space-x-2">
          <span className="text-google-blue cursor-pointer hover:underline font-medium">Verification layer</span>
          <span>active for all meetings.</span>
        </div>
      </div>
      
      <div className="md:w-1/2 mt-16 md:mt-0 flex justify-center z-10 animate-in fade-in zoom-in duration-1000 delay-200">
        <div className="relative w-80 h-80 md:w-[450px] md:h-[450px]">
            <div className="absolute inset-0 rounded-full border border-white/5 animate-[spin_20s_linear_infinite]" />
            <div className="absolute inset-4 rounded-full border border-white/10 animate-[spin_15s_linear_infinite_reverse]" />
            
            <div className="absolute inset-10 rounded-full bg-gradient-to-tr from-google-blue/20 via-google-red/10 to-google-yellow/20 backdrop-blur-3xl p-1 shadow-[0_0_100px_rgba(26,115,232,0.1)]">
                <div className="w-full h-full rounded-full bg-[#121212]/80 flex items-center justify-center overflow-hidden border border-white/10">
                    <div className="text-9xl md:text-[12rem] font-thin bg-clip-text text-transparent bg-gradient-to-tr from-google-blue via-google-red to-google-yellow drop-shadow-2xl">
                        V
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
