"""
Audio Utility Functions
Helpers for audio processing, format conversion, and validation
"""
import struct
import wave
import io
from typing import Tuple, Optional

def pcm16_to_float32(pcm_data: bytes) -> bytes:
    """
    Convert PCM16 audio data to Float32
    
    Args:
        pcm_data: PCM16 audio bytes (little-endian)
    
    Returns:
        Float32 audio bytes
    """
    num_samples = len(pcm_data) // 2
    int16_samples = struct.unpack(f'<{num_samples}h', pcm_data)
    
    float32_samples = []
    for sample in int16_samples:
        float32_samples.append(sample / 32768.0)
    
    return struct.pack(f'{len(float32_samples)}f', *float32_samples)


def float32_to_pcm16(float_data: bytes) -> bytes:
    """
    Convert Float32 audio data to PCM16
    
    Args:
        float_data: Float32 audio bytes
    
    Returns:
        PCM16 audio bytes (little-endian)
    """
    num_samples = len(float_data) // 4
    float_samples = struct.unpack(f'{num_samples}f', float_data)
    
    pcm_samples = []
    for sample in float_samples:
        # Clamp to [-1, 1]
        clamped = max(-1.0, min(1.0, sample))
        # Scale to int16 range
        pcm_sample = int(clamped * 32767)
        pcm_samples.append(pcm_sample)
    
    return struct.pack(f'<{len(pcm_samples)}h', *pcm_samples)


def create_wav_header(
    sample_rate: int = 16000,
    bits_per_sample: int = 16,
    num_channels: int = 1,
    data_size: int = 0
) -> bytes:
    """
    Create a WAV file header
    
    Args:
        sample_rate: Sample rate in Hz
        bits_per_sample: Bits per sample (8, 16, 24, 32)
        num_channels: Number of audio channels
        data_size: Size of audio data in bytes
    
    Returns:
        WAV header bytes
    """
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_size,  # File size - 8
        b'WAVE',
        b'fmt ',
        16,  # Subchunk1 size
        1,   # Audio format (1 = PCM)
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b'data',
        data_size
    )
    
    return header


def pcm16_to_wav(pcm_data: bytes, sample_rate: int = 16000) -> bytes:
    """
    Convert raw PCM16 data to WAV format
    
    Args:
        pcm_data: Raw PCM16 audio bytes
        sample_rate: Sample rate in Hz
    
    Returns:
        WAV file bytes
    """
    header = create_wav_header(
        sample_rate=sample_rate,
        bits_per_sample=16,
        num_channels=1,
        data_size=len(pcm_data)
    )
    
    return header + pcm_data


def wav_to_pcm16(wav_data: bytes) -> Tuple[bytes, int]:
    """
    Extract PCM16 data from WAV file
    
    Args:
        wav_data: WAV file bytes
    
    Returns:
        Tuple of (PCM16 data, sample rate)
    """
    with io.BytesIO(wav_data) as wav_io:
        with wave.open(wav_io, 'rb') as wav_file:
            sample_rate = wav_file.getframerate()
            pcm_data = wav_file.readframes(wav_file.getnframes())
            return pcm_data, sample_rate


def calculate_rms(audio_data: bytes, is_pcm16: bool = True) -> float:
    """
    Calculate RMS (Root Mean Square) volume of audio
    
    Args:
        audio_data: Audio bytes
        is_pcm16: True if PCM16, False if Float32
    
    Returns:
        RMS value (0.0 to 1.0)
    """
    if is_pcm16:
        num_samples = len(audio_data) // 2
        samples = struct.unpack(f'<{num_samples}h', audio_data)
        # Normalize to [-1, 1]
        samples = [s / 32768.0 for s in samples]
    else:
        num_samples = len(audio_data) // 4
        samples = struct.unpack(f'{num_samples}f', audio_data)
    
    if not samples:
        return 0.0
    
    sum_squares = sum(s * s for s in samples)
    rms = (sum_squares / len(samples)) ** 0.5
    
    return rms


def is_speech(audio_data: bytes, threshold: float = 0.02, is_pcm16: bool = True) -> bool:
    """
    Simple voice activity detection based on RMS volume
    
    Args:
        audio_data: Audio bytes
        threshold: RMS threshold for speech detection
        is_pcm16: True if PCM16, False if Float32
    
    Returns:
        True if speech detected, False otherwise
    """
    rms = calculate_rms(audio_data, is_pcm16)
    return rms > threshold


def resample_audio(
    audio_data: bytes,
    source_rate: int,
    target_rate: int,
    is_pcm16: bool = True
) -> bytes:
    """
    Simple linear resampling of audio data
    
    Args:
        audio_data: Audio bytes
        source_rate: Source sample rate
        target_rate: Target sample rate
        is_pcm16: True if PCM16, False if Float32
    
    Returns:
        Resampled audio bytes
    """
    if source_rate == target_rate:
        return audio_data
    
    # Unpack samples
    if is_pcm16:
        num_samples = len(audio_data) // 2
        samples = list(struct.unpack(f'<{num_samples}h', audio_data))
    else:
        num_samples = len(audio_data) // 4
        samples = list(struct.unpack(f'{num_samples}f', audio_data))
    
    # Calculate new length
    ratio = target_rate / source_rate
    new_length = int(len(samples) * ratio)
    
    # Linear interpolation
    resampled = []
    for i in range(new_length):
        src_idx = i / ratio
        idx_low = int(src_idx)
        idx_high = min(idx_low + 1, len(samples) - 1)
        frac = src_idx - idx_low
        
        sample = samples[idx_low] * (1 - frac) + samples[idx_high] * frac
        resampled.append(sample)
    
    # Pack samples
    if is_pcm16:
        resampled = [int(max(-32768, min(32767, s))) for s in resampled]
        return struct.pack(f'<{len(resampled)}h', *resampled)
    else:
        return struct.pack(f'{len(resampled)}f', *resampled)


def get_audio_duration(audio_data: bytes, sample_rate: int = 16000, is_pcm16: bool = True) -> float:
    """
    Calculate duration of audio in seconds
    
    Args:
        audio_data: Audio bytes
        sample_rate: Sample rate in Hz
        is_pcm16: True if PCM16, False if Float32
    
    Returns:
        Duration in seconds
    """
    bytes_per_sample = 2 if is_pcm16 else 4
    num_samples = len(audio_data) // bytes_per_sample
    return num_samples / sample_rate
