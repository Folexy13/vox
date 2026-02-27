import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, CheckCircle, ArrowRight, User, Globe, Loader2 } from 'lucide-react';
import LoadingSpinner, { ProcessingIndicator } from '../components/LoadingSpinner';
import Modal from '../components/Modal';

const VoiceSetup = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('English');
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [progress, setProgress] = useState(0);
  const [profileId, setProfileId] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

  const languages = [
    { name: 'English', code: 'en-US', test: "The quick brown fox jumps over the lazy dog." },
    { name: 'French', code: 'fr-FR', test: "Le renard brun rapide saute par-dessus le chien paresseux." },
    { name: 'Spanish', code: 'es-ES', test: "El veloz zorro marrón salta sobre el perro perezoso." },
    { name: 'Yoruba', code: 'yo-NG', test: "Akọ mọ́tò pupa yá kánkán fo lórí ajá tí ó lẹ." },
    { name: 'Igbo', code: 'ig-NG', test: "Agụ owuru na-acha nchara nchara na-awụli elu n'elu nkita umengwụ." },
    { name: 'Hausa', code: 'ha-NG', test: "Sauri launin ruwan kasa fox tsalle a kan malalaci kare." },
  ];

  const selectedLang = languages.find(l => l.name === language);

  const showModal = (type, title, message) => {
    setModal({ isOpen: true, type, title, message });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const startRecording = async () => {
    try {
      setRecording(true);
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mediaRecorder = new MediaRecorder(stream);
      let chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        // Show processing state
        setProcessing(true);
        
        const blob = new Blob(chunks, { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('file', blob, 'profile.wav');

        try {
          const host = window.location.hostname;
          const response = await fetch(`http://${host}:8001/api/voice-profile`, {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();
          setProfileId(data.profile_id);
          setCaptured(true);
        } catch (err) {
          console.error("Failed to upload voice profile", err);
          showModal('warning', 'Voice Profile', 'Could not save voice profile to server, but you can still continue with the meeting.');
          // Fallback for demo
          setCaptured(true);
        } finally {
          setProcessing(false);
        }
      };

      mediaRecorder.start();
      
      let current = 0;
      const interval = setInterval(() => {
        current += 1;
        setProgress(current * 10);
        if (current >= 10) {
          clearInterval(interval);
          mediaRecorder.stop();
          stream.getTracks().forEach(t => t.stop());
          setRecording(false);
        }
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied", err);
      setRecording(false);
      showModal('error', 'Microphone Access Required', 'Please allow microphone access to record your voice profile. You can also skip this step and continue without a voice profile.');
    }
  };

  const handleSkipRecording = () => {
    setCaptured(true);
  };

  const handleContinue = () => {
    const selectedLangData = languages.find(l => l.name === language);
    navigate(`/call/${roomId}`, { 
      state: { 
        userName: name || 'Guest', 
        userLanguage: language,
        userLanguageCode: selectedLangData?.code || 'en-US',
        profileId: profileId
      } 
    });
  };

  return (
    <div className="min-h-screen bg-google-dark flex flex-col items-center justify-center p-6 text-center">
      {/* Modal */}
      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
      />

      <div className="max-w-2xl w-full bg-google-gray/40 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/10 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-google-blue/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-google-red/20 rounded-full blur-3xl" />

        {step === 1 ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-normal mb-2">Welcome to Vox</h2>
            <p className="text-gray-400 mb-8 text-sm uppercase tracking-widest font-medium">Join Meeting: {roomId}</p>
            
            <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="space-y-6 text-left max-w-md mx-auto">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center">
                  <User className="w-4 h-4 mr-2" /> Your Name
                </label>
                <input
                  type="text"
                  placeholder="Guest Name (Optional)"
                  className="w-full bg-google-dark/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-google-blue transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center">
                  <Globe className="w-4 h-4 mr-2" /> Select Language
                </label>
                <select
                  className="w-full bg-google-dark/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-google-blue transition-all appearance-none"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.name}>{lang.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-google-blue hover:bg-blue-600 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-google-blue/20 flex items-center justify-center group"
              >
                Proceed to Voice Test
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <h2 className="text-3xl font-normal mb-4">Let Vox learn your voice</h2>
            <p className="text-gray-400 mb-8">
              Vox needs to hear you speak in <span className="text-google-blue font-bold">{language}</span> to bridge the gap.
            </p>

            <div className="bg-google-dark/50 backdrop-blur-md p-8 rounded-2xl mb-8 border border-white/5 italic text-2xl leading-relaxed text-white/90">
              "{selectedLang.test}"
            </div>

            {processing ? (
              // Processing state - uploading voice profile
              <div className="flex flex-col items-center py-8">
                <LoadingSpinner 
                  size="lg" 
                  message="Creating Voice Profile"
                  subMessage="Analyzing your voice patterns..."
                />
              </div>
            ) : !captured ? (
              <div className="flex flex-col items-center">
                <button
                  onClick={startRecording}
                  disabled={recording}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all relative ${
                    recording ? 'bg-google-red scale-110' : 'bg-google-blue hover:scale-105 shadow-xl shadow-google-blue/30'
                  }`}
                >
                  {recording && (
                    <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping" />
                  )}
                  <Mic className="w-12 h-12 text-white" />
                </button>
                <p className="mt-6 font-medium tracking-wide">
                  {recording ? `Recording... ${progress/10}s` : 'Click to start 10s recording'}
                </p>
                {recording && (
                  <div className="w-full mt-8 bg-white/5 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-google-red h-full transition-all duration-1000 shadow-[0_0_15px_rgba(234,67,53,0.5)]" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                
                {/* Skip option */}
                {!recording && (
                  <button
                    onClick={handleSkipRecording}
                    className="mt-8 text-gray-400 hover:text-white text-sm underline transition-colors"
                  >
                    Skip voice profile (not recommended)
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center animate-in zoom-in duration-500">
                <div className="w-20 h-20 bg-google-green/20 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-12 h-12 text-google-green" />
                </div>
                <p className="text-2xl font-medium text-google-green">Voice Profile Calibrated!</p>
                <p className="text-gray-400 mt-2 text-sm">
                  {profileId ? 'Your voice profile has been saved.' : 'Ready to join the meeting.'}
                </p>
                <button
                  onClick={handleContinue}
                  className="mt-10 bg-white text-google-dark hover:bg-gray-200 px-12 py-4 rounded-xl font-bold transition-all shadow-2xl flex items-center"
                >
                  Enter Meeting
                  <ArrowRight className="ml-2 w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceSetup;
