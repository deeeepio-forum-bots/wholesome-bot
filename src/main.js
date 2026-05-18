const config = {
	pages: 4,
	aiInterval: 30000,
	fetchPageThrottle: 500,
};

console.log("Started at", new Date());

const checkedPosts = new Set();

console.log(
	"Prompt:",
	process.env.PROMPT.replace("{{Comment}}", "<comment>")
		.replace("{{Input}}", "<input>")
		.replace("{{Context}}", "<context>"),
);

// Data formatter
const formatComment = (comment) =>
	`Comment author: ${comment.user.username}\nComment text:\n${comment.text}`;
const formatPost = (post) =>
	`Post title: ${post.title}\nPost author: ${post.user.username}\nPost text:\n${post.text}`;

// AI endpoint
const aiResponse = async (input, comment, context) => {
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
					content: process.env.PROMPT.replace("{{Comment}}", comment)
						.replace("{{Input}}", input)
						.replace("{{Context}}", context),
				},
			],
			temperature: process.env.TEMPERATURE ?? 0.8,
			top_p: process.env.TOP_P ?? 1,
			frequency_penalty: process.env.FREQUENCY_PENALTY ?? 0,
			presence_penalty: process.env.PRESENCE_PENALTY ?? 0,
			stream: false,
			reasoning_effort: process.env.REASONING_EFFORT ?? "medium",
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

let lastCommentTime = 0;
const postComment = async (post_id, parent_id, text) => {
	if (Date.now() - lastCommentTime < config.commentInterval) {
		await new Promise((resolve) =>
			setTimeout(
				resolve,
				config.commentInterval - (Date.now() - lastCommentTime),
			),
		);
	}
	const body = {
		forum_id: "en",
		post_id,
		text,
	};
	if (parent_id != null) body.parent_id = parent_id;
	await fetch(
		`https://${process.env.DEEEEPIO_API}/forumPosts/en/${post_id}/comments`,
		{
			headers,
			body: JSON.stringify(body),
			method: "POST",
		},
	);

	lastCommentTime = Date.now();
};

const sendFriendRequest = async (id) => {
	const res = await fetch(
		`https://${process.env.DEEEEPIO_API}/friendRequests/${id}`,
		{
			headers,
			method: "POST",
		},
	).then((r) => r.json());
	return res;
};

let lastPostFetchTime = 0;
const executePost = async (post) => {
	const id = post.id;
	const body = post.text;

	if (checkedPosts.has(id)) return;
	checkedPosts.add(id);
	console.log(`Checking post ${id} - https://deeeep.io/forum/en/${id}`);
	if (Date.now() - lastPostFetchTime < config.fetchPageThrottle) {
		await new Promise((resolve) =>
			setTimeout(
				resolve,
				config.fetchPageThrottle - (Date.now() - lastPostFetchTime),
			),
		);
	}
	const comments = await fetch(
		`https://${process.env.DEEEEPIO_API}/forumPosts/en/${id}/comments?order=new`,
	).then((r) => r.json());
	lastPostFetchTime = Date.now();
	comments.reverse();
	const replyQueue = [];
	for (const comment of comments) {
		// search for keyword
		if (
			!comment.text
				.toLowerCase()
				.match(/(wh|w|h)ole?.?s(o|u)me?.?(ness?)?.?bot/)
		)
			continue;

		// dont reply to the same comment twice
		if (replyQueue.includes(comment.id)) continue;

		// dont reply to comments that have already been replied to
		if (
			comments.find((c) => c.parent_id === comment.id && c.user.id === userId)
		)
			continue;

		// dont reply to own comments
		if (comment.user.id === userId) continue;

		// dont reply to comments with deleted parents
		if (comment.parent_id && !comments.find((c) => c.id === comment.parent_id))
			continue;

		replyQueue.push(comment.id);
	}

	for (const commentId of replyQueue) {
		console.log(
			`Replying to comment ${commentId} in post ${id} - https://deeeep.io/forum/en/${id}#comment-${commentId}`,
		);
		const comment = comments.find((c) => c.id === commentId);
		const text =
			comment.parent_id == null
				? formatPost(post)
				: formatComment(comments.find((c) => c.id === comment.parent_id));
		const context = [];
		let p = comment.parent_id;
		while (p != null) {
			context.push(formatComment(comments.find((c) => c.id === p)));
			p = comments.find((c) => c.id === p).parent_id;
		}
		if (comment.parent_id != null) context.push(formatPost(post));
		context.reverse();
		const reply = await aiResponse(
			text,
			formatComment(comment),
			context.length > 0
				? context.join("\n\n------------------\n\n")
				: "No additional context",
		);
		await postComment(id, commentId, reply);
		console.log(`Replied to comment ${commentId} in post ${id}`);

		try {
			console.log(`Sending friend request to user ${comment.user.id}`);
			await sendFriendRequest(comment.user.id);
			console.log(`Sent friend request to user ${comment.user.id}`);
		} catch (e) {
			console.error(e);
		}
	}
};

const executePage = async (pageNum, type) => {
	console.log(`Checking page ${pageNum} - ${type}`);
	const data = await fetch(
		`https://${process.env.DEEEEPIO_API}/forumPosts/en?count=15&order=${type}&page=${pageNum}`,
	).then((r) => r.json());
	for (const post of data) {
		if (post.comment_count === 0) continue;
		await executePost(post);
	}
};

await signIn();

for (let i = 1; i <= config.pages; i++) {
	await executePage(i, "new");
	await executePage(i, "hot");
}
