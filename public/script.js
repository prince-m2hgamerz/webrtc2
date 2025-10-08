const usernameInput = document.getElementById("usernameInput");
const registerBtn = document.getElementById("registerBtn");
const usersList = document.getElementById("usersList");
const callArea = document.getElementById("callArea");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const hangupBtn = document.getElementById("hangupBtn");
const shareLink = document.getElementById("shareLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");

const incomingCallModal = document.getElementById("incomingCallModal");
const callerName = document.getElementById("callerName");
const acceptBtn = document.getElementById("acceptBtn");
const rejectBtn = document.getElementById("rejectBtn");

let username, ws, pc;
let candidateQueue = [];
let currentCaller = null;

// Helper to safely send via WebSocket
function sendWS(data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  else ws.addEventListener("open", () => ws.send(JSON.stringify(data)), { once: true });
}

// Create or reuse peer connection
function createPeerConnection() {
  if (pc) return pc;

  pc = new RTCPeerConnection();

  pc.onicecandidate = (event) => {
    if (event.candidate && currentCaller) {
      sendWS({ type: "candidate", candidate: event.candidate, target: currentCaller });
    }
  };

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  return pc;
}

// Register user
registerBtn.onclick = () => {
  username = usernameInput.value.trim();
  if (!username) return alert("Enter a username");

  ws = new WebSocket("wss://webrtc2-ax2m.onrender.com");

  ws.onopen = () => sendWS({ type: "register", username });

  ws.onmessage = async (event) => {
    let data;
    if (event.data instanceof Blob) data = JSON.parse(await event.data.text());
    else data = JSON.parse(event.data);

    if (data.type === "users") updateUserList(data.users);
    if (["sdp", "candidate", "reject"].includes(data.type)) handleIncoming(data);
  };
};

// Update user list
function updateUserList(users) {
  usersList.innerHTML = "";
  users.filter(u => u !== username).forEach(u => {
    const div = document.createElement("div");
    div.innerHTML = `
      <span>${u}</span>
      <div class="flex gap-2">
        <button class="callBtn bg-blue-500 px-3 py-1 rounded">Video</button>
        <button class="callBtn bg-purple-500 px-3 py-1 rounded">Voice</button>
      </div>
    `;
    div.querySelectorAll(".callBtn").forEach(btn => {
      btn.onclick = () => startCall(u, btn.textContent === "Video");
    });
    usersList.appendChild(div);
  });
}

// Start call to user
async function startCall(targetUser, videoCall = true) {
  currentCaller = targetUser;
  pc = createPeerConnection();

  const localStream = await navigator.mediaDevices.getUserMedia({ video: videoCall, audio: true });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  localVideo.srcObject = localStream;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendWS({ type: "sdp", sdp: pc.localDescription, target: targetUser });

  callArea.classList.remove("hidden");
  shareLink.textContent = `Calling ${targetUser}...`;
}

// Handle incoming SDP/ICE
async function handleIncoming(data) {
  if (!pc) pc = createPeerConnection();

  if (data.type === "sdp") {
    if (data.sdp.type === "offer") {
      currentCaller = data.from;
      incomingCallModal.classList.remove("hidden");
      callerName.textContent = `Call from ${currentCaller}`;

      acceptBtn.onclick = async () => {
        incomingCallModal.classList.add("hidden");
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        localVideo.srcObject = localStream;

        await pc.setRemoteDescription(data.sdp);
        // Add queued ICE candidates
        candidateQueue.forEach(c => pc.addIceCandidate(c));
        candidateQueue = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWS({ type: "sdp", sdp: pc.localDescription, target: currentCaller });

        callArea.classList.remove("hidden");
      };

      rejectBtn.onclick = () => {
        incomingCallModal.classList.add("hidden");
        sendWS({ type: "reject", target: currentCaller });
        currentCaller = null;
      };
    } else if (data.sdp.type === "answer") {
      if (pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(data.sdp);
        // Add queued ICE candidates
        candidateQueue.forEach(c => pc.addIceCandidate(c));
        candidateQueue = [];
      }
    }
  } else if (data.type === "candidate") {
    if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
    else candidateQueue.push(data.candidate);
  } else if (data.type === "reject") {
    alert(`${data.from} rejected the call.`);
    pc?.close();
    pc = null;
    callArea.classList.add("hidden");
  }
}

// Hangup
hangupBtn.onclick = () => {
  pc?.close();
  pc = null;
  currentCaller = null;
  callArea.classList.add("hidden");
  shareLink.textContent = "";
};

// Copy room link
copyLinkBtn.onclick = () => {
  navigator.clipboard.writeText(`${window.location.origin}?user=${username}`)
    .then(() => alert("Link copied!"))
    .catch(() => alert("Failed to copy"));
};
