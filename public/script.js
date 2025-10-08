const usernameInput = document.getElementById("usernameInput");
const registerBtn = document.getElementById("registerBtn");
const usersList = document.getElementById("usersList");
const callArea = document.getElementById("callArea");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const hangupBtn = document.getElementById("hangupBtn");

let username, ws;
let pc = null;
let candidateQueue = [];
let currentCaller = null;

// WebSocket safe send
function sendWS(data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  else ws.addEventListener("open", () => ws.send(JSON.stringify(data)), { once: true });
}

// Create fresh PeerConnection for each call
async function createPeerConnection(localStream, remote = false) {
  pc = new RTCPeerConnection();

  // Add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Remote track
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // ICE
  pc.onicecandidate = (event) => {
    if (event.candidate && currentCaller) {
      sendWS({ type: "candidate", candidate: event.candidate, target: currentCaller });
    }
  };

  return pc;
}

// Register user
registerBtn.onclick = () => {
  username = usernameInput.value.trim();
  if (!username) return alert("Enter username");

  ws = new WebSocket("wss://webrtc2-ax2m.onrender.com");

  ws.onopen = () => sendWS({ type: "register", username });

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "users") updateUserList(data.users);
    if (["sdp", "candidate"].includes(data.type)) handleIncoming(data);
  };
};

// Update user list
function updateUserList(users) {
  usersList.innerHTML = "";
  users.filter(u => u !== username).forEach(u => {
    const div = document.createElement("div");
    div.innerHTML = `
      <span>${u}</span>
      <button class="callBtn">Call</button>
    `;
    div.querySelector(".callBtn").onclick = () => startCall(u);
    usersList.appendChild(div);
  });
}

// Start outgoing call
async function startCall(targetUser) {
  currentCaller = targetUser;

  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  pc = await createPeerConnection(localStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendWS({ type: "sdp", sdp: pc.localDescription, target: targetUser });

  callArea.classList.remove("hidden");
}

// Handle incoming SDP / ICE
async function handleIncoming(data) {
  if (data.type === "candidate") {
    if (pc && pc.remoteDescription) await pc.addIceCandidate(data.candidate);
    else candidateQueue.push(data.candidate);
  } else if (data.type === "sdp") {
    if (data.sdp.type === "offer") {
      currentCaller = data.from;

      const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;

      pc = await createPeerConnection(localStream);

      await pc.setRemoteDescription(data.sdp);

      // Add queued ICE candidates
      candidateQueue.forEach(c => pc.addIceCandidate(c));
      candidateQueue = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWS({ type: "sdp", sdp: pc.localDescription, target: currentCaller });

      callArea.classList.remove("hidden");
    } else if (data.sdp.type === "answer") {
      await pc.setRemoteDescription(data.sdp);
      candidateQueue.forEach(c => pc.addIceCandidate(c));
      candidateQueue = [];
    }
  }
}

// Hangup
hangupBtn.onclick = () => {
  pc?.close();
  pc = null;
  currentCaller = null;
  callArea.classList.add("hidden");
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
};
