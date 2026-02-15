class MediaOptimizer {
    static compressImage(base64, maxWidth = 800, quality = 0.7) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const compressed = canvas.toDataURL('image/jpeg', quality);
                
                canvas.width = 0;
                canvas.height = 0;
                
                resolve(compressed);
            };
            img.onerror = () => resolve(base64);
            img.src = base64;
        });
    }
    
    static async compressAudio(base64, targetSizeKB = 500) {
        try {
            const sizeKB = (base64.length * 0.75) / 1024;
            
            if (sizeKB <= targetSizeKB) {
                return base64;
            }
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await this.base64ToArrayBuffer(base64);
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const sampleRate = Math.min(22050, audioBuffer.sampleRate);
            const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * sampleRate, sampleRate);
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();
            
            const renderedBuffer = await offlineContext.startRendering();
            const compressed = await this.audioBufferToBase64(renderedBuffer);
            
            audioContext.close();
            
            return compressed.length < base64.length ? compressed : base64;
        } catch (e) {
            console.error('Audio compression error:', e);
            return base64;
        }
    }
    
    static base64ToArrayBuffer(base64) {
        const base64Data = base64.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    static async audioBufferToBase64(audioBuffer) {
        const wav = this.audioBufferToWav(audioBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }
    
    static audioBufferToWav(audioBuffer) {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        
        let result;
        if (numberOfChannels === 2) {
            result = this.interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
        } else {
            result = audioBuffer.getChannelData(0);
        }
        
        const buffer = new ArrayBuffer(44 + result.length * 2);
        const view = new DataView(buffer);
        
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + result.length * 2, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numberOfChannels * bitDepth / 8, true);
        view.setUint16(32, numberOfChannels * bitDepth / 8, true);
        view.setUint16(34, bitDepth, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, result.length * 2, true);
        
        this.floatTo16BitPCM(view, 44, result);
        
        return buffer;
    }
    
    static interleave(leftChannel, rightChannel) {
        const length = leftChannel.length + rightChannel.length;
        const result = new Float32Array(length);
        
        let inputIndex = 0;
        for (let index = 0; index < length;) {
            result[index++] = leftChannel[inputIndex];
            result[index++] = rightChannel[inputIndex];
            inputIndex++;
        }
        return result;
    }
    
    static writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    
    static floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }
    
    static async optimizeMedia(base64, type = 'image') {
        if (!base64) return null;
        
        const sizeKB = (base64.length * 0.75) / 1024;
        
        if (sizeKB > 2000) {
            alert('Le fichier est trop volumineux (max 2MB). Compression forcée...');
        }
        
        if (type === 'image') {
            return await this.compressImage(base64, 800, 0.7);
        } else if (type === 'audio') {
            return await this.compressAudio(base64, 500);
        }
        
        return base64;
    }
}

window.MediaOptimizer = MediaOptimizer;
