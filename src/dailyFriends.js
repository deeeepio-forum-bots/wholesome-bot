const config = {
	pages: 50,
	fetchPageThrottle: 500,
};

const d = new Date();
const months = [
	"Jan.",
	"Feb.",
	"Mar.",
	"Apr.",
	"May",
	"Jun.",
	"Jul.",
	"Aug.",
	"Sep.",
	"Oct.",
	"Nov.",
	"Dec.",
];
const todaysDate = `${months[d.getUTCMonth()]} ${d.getUTCDate() - (d.getUTCHours() < 12 ? 1 : 0)}, ${d.getUTCFullYear()}`;

console.log("Started at", new Date());

// Get CSRF token
const headers = {
	"content-type": "application/json;charset=UTF-8",
};
const decodeCSRF = (csrf, magicStr) =>
	csrf
		.match(/.{1,2}/g)
		.map((t) => Number.parseInt(t, 16))
		.map((t) =>
			magicStr
				.split("")
				.map((t) => t.charCodeAt(0))
				.reduce((t, e) => t ^ e, t),
		)
		.map((t) => String.fromCharCode(t))
		.join("");
await fetch(`https://${process.env.DEEEEPIO_API}/auth/timezone`, {
	credentials: "include",
})
	.then((r) => {
		headers.cookie = r.headers
			.getSetCookie()[0]
			.match(/dinfo\.schema=.*?(?=;)/i)[0];
		return r;
	})
	.then((r) => r.json())
	.then((r) => {
		headers.twitch = decodeCSRF(r.t, "CSRFRDRDNKNK");
	});

let userId = 0;
let username = "";
const signIn = async () => {
	await fetch(`https://${process.env.DEEEEPIO_API}/auth/local/signin`, {
		headers: headers,
		body: JSON.stringify({
			email: process.env.DEEEEPIO_USERNAME,
			password: process.env.DEEEEPIO_PASSWORD,
		}),
		method: "POST",
	})
		.then((r) => r.json())
		.then((r) => {
			userId = r.user.id;
			username = r.user.username;
			headers.cookie += `; CHROMEV=${r.token}`;
		});
};

const createPost = async (text) => {
	const body = {
		forum_id: "en",
		category: "general",
		title: `Friends Report – ${todaysDate}`,
		text,
	};
	const res = await fetch(`https://${process.env.DEEEEPIO_API}/forumPosts/en`, {
		headers,
		body: JSON.stringify(body),
		method: "POST",
	}).then((r) => r.json());
	if (!res.id) {
		console.error(res);
		throw new Error("Post creation failed!");
	}
	console.log("Post created!", "https://deeeep.io/forum/en/" + res.id);
};

const getAllFriends = async () => {
	const res = await fetch(
		`https://${process.env.DEEEEPIO_API}/users/friends?online=false`,
		{
			headers,
		},
	).then((r) => r.json());
	return res;
};

const getFriendRequests = async () => {
	const res = await fetch(
		`https://${process.env.DEEEEPIO_API}/friendRequests`,
		{
			headers,
		},
	).then((r) => r.json());
	return res;
};

const acceptFriendRequest = async (id) => {
	const res = await fetch(
		`https://${process.env.DEEEEPIO_API}/friendRequests/accept/${id}`,
		{
			headers,
			method: "POST",
		},
	).then((r) => r.json());
	return res;
};

let shouldInterrupt = false;
let previousPost;
for (let i = 1; i <= config.pages; i++) {
	if (shouldInterrupt) break;

	console.log(`Checking page ${i}`);
	const data = await fetch(
		`https://${process.env.DEEEEPIO_API}/forumPosts/en?count=15&order=new&page=${i}`,
	).then((r) => r.json());

	for (const post of data) {
		if (shouldInterrupt || post.user.id !== userId) continue;
		if (post.title.toLowerCase().includes("friend")) {
			shouldInterrupt = true;
			previousPost = post;
		}
	}
}

await signIn();
const friendRequests = await getFriendRequests();
for (const request of friendRequests) {
	await acceptFriendRequest(request.sender_id);
}
const friends = await getAllFriends();
const previousFriendCount =
	(previousPost && previousPost.text.match(/(?<=Total friends: )\d+/)[0]) || -1;
const newFriends = previousFriendCount - friends.length;
let text =
	previousFriendCount > -1
		? `Today I made ${newFriends} new friends! 
I accepted ${friendRequests.length} friend requests and ${newFriends - friendRequests.length} people accepted my friend request.

Total friends: ${friends.length}`
		: `Today I accepted ${friendRequests.length} friend requests

Total friends: ${friends.length}`;
text += `

— ${username || "Wholesome Bot"}
🐧🎉`;
console.log(text);
await createPost(text);
