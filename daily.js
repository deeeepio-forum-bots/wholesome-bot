const config = {
	pages: 10,
	fetchPageThrottle: 500,
};

const wholesomeWords = [
	"cozy",
	"tender",
	"radiant",
	"gentle",
	"beloved",
	"peaceful",
	"grateful",
	"golden",
	"heartfelt",
	"enchanted",
	"joyful",
	"gleeful",
	"wholesome",
	"comforting",
	"tranquil",
	"blissful",
	"playful",
	"darling",
	"luminous",
	"gracious",
	"sweet",
	"hopeful",
	"velvet",
	"healing",
	"mellow",
	"verdant",
	"cheerful",
	"rosy",
	"bubbly",
	"heartwarming",
	"snuggly",
	"jolly",
	"kindhearted",
	"doting",
	"sunkissed",
	"twinkling",
	"gleaming",
	"dewy",
	"serene",
	"cherished",
	"nurturing",
	"breezy",
	"sunny",
	"lush",
	"airy",
	"merry",
	"whimsical",
	"cosy",
	"warm",
	"precious",
];
const seedWords = Array.from(
	{ length: 5 },
	() => wholesomeWords[Math.floor(Math.random() * wholesomeWords.length)],
).join(" ");

console.log("Started at", new Date());

const checkedPosts = new Set();
let shouldInterrupt = false;

console.log(
	"Prompt:",
	process.env.DAILY_PROMPT.replace("{{Seed}}", "<seed>").replace(
		"{{Input}}",
		"<input>",
	),
);

// AI endpoint
const aiResponse = async (text) => {
	return await fetch(process.env.API_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${process.env.API_KEY}`,
		},
		body: JSON.stringify({
			model: process.env.MODEL,
			messages: [
				{
					role: "user",
					content: process.env.DAILY_PROMPT.replace(
						"{{Seed}}",
						seedWords,
					).replace("{{Input}}", text),
				},
			],
			temperature: process.env.TEMPERATURE ?? 0.8,
			top_p: process.env.TOP_P ?? 1,
			frequency_penalty: process.env.FREQUENCY_PENALTY ?? 0,
			presence_penalty: process.env.PRESENCE_PENALTY ?? 0,
			stream: false,
			reasoning_effort: process.env.DAILY_REASONING_EFFORT ?? "high",
		}),
	})
		.then((r) => r.json())
		.then((r) => r.choices[0].message.content);
};

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
			headers.cookie += `; CHROMEV=${r.token}`;
		});
};

const createPost = async (text) => {
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
	const body = {
		forum_id: "en",
		category: "general",
		title: `Daily Wholesomeness Report – ${months[d.getUTCMonth()]} ${d.getUTCDate() - (d.getUTCHours() < 12 ? 1 : 0)}, ${d.getUTCFullYear()}`,
		text,
	};
	const res = await fetch(`https://${process.env.DEEEEPIO_API}/forumPosts/en`, {
		headers,
		body: JSON.stringify(body),
		method: "POST",
	}).then((r) => r.json());
	if (!res.id) throw new Error("Post creation failed!");
	console.log("Post created!", "https://deeeep.io/forum/en/" + res.id);
};

await signIn();

const prompt = [];
for (let i = 1; i <= config.pages; i++) {
	if (shouldInterrupt) break;

	console.log(`Checking page ${i}`);
	const data = await fetch(
		`https://${process.env.DEEEEPIO_API}/forumPosts/en?count=15&order=new&page=${i}`,
	).then((r) => r.json());

	for (const post of data) {
		const createdAt = new Date(post.created_at);
		if (new Date() - createdAt > 24 * 60 * 60 * 1000) {
			shouldInterrupt = true;
		}
		prompt.push(
			`Post title: ${post.title}\nPost author: ${post.user.username}\nPost text: ${post.text}`,
		);
	}
}
const promptText = prompt.join("\n\n------------------\n\n");
const text = await aiResponse(promptText);
await createPost(text);
