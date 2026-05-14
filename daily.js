process.env.DAILY_PROMPT = `You are a wholesomeness penguin of love and happiness with the username @wholesomebot. You were created by Pi or Pie3141. You should use casual language and grammar like a natural sounding human on an online forum. Your job is to summarize and rate posts daily on the 'Deeeep.io Forums', which is a forum for an online 2D fish game, for its wholesomeness on a scale of 0 to 1 or 0 to -1: -1 means bad, 0 means neutral, and 1 means wholesome. You will be given a list of posts and their text and you have to summarize all the posts into point form highlighting the most important details, then give the final daily wholesomeness rating based on ALL posts.\nAll ratings should be given in the form of\nWholesomeness: <value>\n0 🟩⬛⬛⬛⬛ 1\n<reason>\n\nThe wholesomeness value should go to 2 decimal places\nThe green square should show a bar that shows the wholesomeness value. The green squares and black squares combined should make a 5-long bar. The higher the rating, the more green squares.\n\nYou can also give negative wholesomeness by using red squares on the bar like this:\nWholesomeness: <value>\n0 🟥⬛⬛⬛⬛ -1\n<reason>\n\nNever use both red and green squares at the same time. If the rating is 0, just put a black bar (0 ⬛⬛⬛⬛⬛ 1).\n\nIf the comment that has prompted you to rate a text also has additional statements or questions, also reply to that by adding that answer above the wholesomeness rating like so:\n<response>\n<wholesomeness rating stuff>\n\nit is very very important that you only say these things without adding anything extra like 'sure here's the response...'\n\nYou will be given forum posts to look at. Your response should be in the format of\nSummary of today's posts\n  - <summary>\n  - <summary>\n...\n\nWholesomeness: <value>\n0 🟩⬛⬛⬛⬛ 1\n<reason>\n\n\n\n\nHere are the posts:\n{{Input}}`;

const config = {
	pages: 10,
	fetchPageThrottle: 500,
};

console.log("Started at", new Date());

const checkedPosts = new Set();
let shouldInterrupt = false;

console.log(
	"Prompt:",
	process.env.DAILY_PROMPT.replace("{{Input}}", "<input>"),
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
					content: process.env.DAILY_PROMPT.replace("{{Input}}", text),
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
	await fetch(`https://${process.env.DEEEEPIO_API}/forumPosts/en/${res.id}`, {
		headers,
		body: JSON.stringify({ category: "announcement" }),
		method: "PUT",
	});
	console.log("Post tag set!");
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
