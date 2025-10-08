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

let username, ws, pc, makingOffer=false, ignoreOffer=false;
let currentCaller = null;

// Register user
registerBtn.onclick = () => {
  username = usernameInput.value.trim();
  if (!username) return alert("Enter a username");

  ws = new WebSocket("wss://webrtc2-ax2m.onrender.com");

  ws.onopen = () => ws.send(JSON.stringify({ type: "register", username }));

  ws.onmessage = async (event) => {
    let data;
    if (event.data instanceof Blob) data = JSON.parse(await event.data.text());
    else data = JSON.parse(event.data);

    if (data.type === "users") updateUserList(data.users);
    if (data.type === "sdp" || data.type === "candidate") handleIncoming(data);
  };
};

// Update online users list
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

// Start call to specific user
async function startCall(targetUser, videoCall=true) {
  pc = new RTCPeerConnection();
  const localStream = await navigator.mediaDevices.getUserMedia({ video: videoCall, audio: true });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  localVideo.srcObject = localStream;

  pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
  pc.onicecandidate = e => {
    if (e.candidate) ws.send(JSON.stringify({ type: "candidate", target: targetUser, candidate: e.candidate }));
  };

  makingOffer = true;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "sdp", sdp: pc.localDescription, target: targetUser }));
  makingOffer = false;

  callArea.classList.remove("hidden");
  shareLink.textContent = `Calling ${targetUser}...`;
}

// Handle incoming SDP / ICE
async function handleIncoming(data) {
  if (!pc) pc = new RTCPeerConnection();

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
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "sdp", sdp: pc.localDescription, target: currentCaller }));

        pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
        callArea.classList.remove("hidden");
      };

      rejectBtn.onclick = () => {
        incomingCallModal.classList.add("hidden");
        ws.send(JSON.stringify({ type: "reject", target: currentCaller }));
        currentCaller = null;
      };
    } else if (data.sdp.type === "answer" && pc.signalingState === "have-local-offer") {
      await pc.setRemoteDescription(data.sdp);
    }
  } else if (data.type === "candidate") {
    try { await pc.addIceCandidate(data.candidate); } catch(e) { console.error(e); }
  }
}

// Hangup
hangupBtn.onclick = () => {
  if (pc) pc.close();
  pc = null;
  callArea.classList.add("hidden");
  shareLink.textContent = "";
};

// Copy link
copyLinkBtn.onclick = () => {
  navigator.clipboard.writeText(`${window.location.origin}?user=${username}`)
    .then(()=>alert("Link copied!"))
    .catch(()=>alert("Failed to copy"));
};
