const config = {
	pages: 4,
	commentInterval: 20000,
};

// AI endpoint
const aiResponse = async (text) => {
	return await fetch(process.env.GPT_API_ENDPOINT, {
		body: JSON.stringify({ text }),
		method: "POST",
		headers: {
			accept: "text/plain",
			"Content-Type": "application/json",
		},
	})
		.then((r) => r.json())
		.then((r) => r.response);
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
await fetch("https://api.deeeep.io/auth/timezone", {
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
	await fetch("https://api.deeeep.io/auth/local/signin", {
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
	const res = await fetch(
		`https://api.deeeep.io/forumPosts/en/${post_id}/comments`,
		{
			headers,
			body: JSON.stringify(body),
			method: "POST",
		},
	);

	lastCommentTime = Date.now();
};

const executePost = async (id, postBody) => {
	console.log(`Checking post ${id}`);
	const comments = await fetch(
		`https://api.deeeep.io/forumPosts/en/${id}/comments?order=new`,
	).then((r) => r.json());
	comments.reverse();
	const acknowledgedComments = [];
	const replyQueue = [];
	for (const comment of comments) {
		// search for keyword
		if (!comment.text.toLowerCase().includes("wholesomebot")) continue;
		// dont reply to the same parent comment twice
		if (acknowledgedComments.includes(comment.parent_id)) continue;
		// dont reply to the same comment twice
		if (replyQueue.includes(comment.id)) continue;
		// dont reply to comments that have already been replied to
		if (
			comments.find((c) => c.parent_id === comment.id && c.user.id === userId)
		)
			continue;

		// dont reply to comments with a sibling that has been replied to
		const parentCommentReplies = comments.filter(
			(c) => c.parent_id === comment.parent_id,
		);
		if (
			comments.find(
				(c) =>
					parentCommentReplies.includes(c.parent_id) && c.user.id === userId,
			)
		)
			continue;

		acknowledgedComments.push(comment.parent_id);
		replyQueue.push(comment.id);
	}

	for (const commentId of replyQueue) {
		console.log(`Replying to comment ${commentId} in post ${id}`);
		const comment = comments.find((c) => c.id === commentId);
		const text =
			comment.parent_id == null
				? postBody
				: comments.find((c) => c.id === comment.parent_id).text;
		const reply = await aiResponse(text);
		await postComment(id, commentId, reply);
		console.log(`Replied to comment ${commentId} in post ${id}`);
	}
};

const executePage = async (pageNum) => {
	console.log(`Checking page ${pageNum}`);
	const data = await fetch(
		`https://api.deeeep.io/forumPosts/en?count=15&order=new&page=${pageNum}`,
	).then((r) => r.json());
	for (const post of data) {
		if (post.comment_count === 0) continue;
		await executePost(post.id, post.text);
	}
};

await signIn();

for (let i = 1; i <= config.pages; i++) {
	await executePage(i);
}
