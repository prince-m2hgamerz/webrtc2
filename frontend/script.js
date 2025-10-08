const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const callArea = document.getElementById("callArea");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const hangupBtn = document.getElementById("hangupBtn");

let pc, ws;

joinBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Please enter a room ID");

  joinBtn.disabled = true;
  roomInput.disabled = true;

  await startCall(roomId);
};

hangupBtn.onclick = () => {
  if (pc) pc.close();
  if (ws) ws.close();
  location.reload();
};

async function startCall(roomId) {
  pc = new RTCPeerConnection();
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  localVideo.srcObject = localStream;

  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Replace this URL with your Render backend WebSocket URL
  // const wsUrl = `wss://your-backend-name.onrender.com/?room=${roomId}`;
  const wsUrl = `wss://webrtc2-ax2m.onrender.com/?room=${roomId}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ sdp: pc.localDescription }));
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    }
  };

  ws.onopen = async () => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({ candidate: event.candidate }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ sdp: pc.localDescription }));

    callArea.classList.remove("hidden");
  };
}

