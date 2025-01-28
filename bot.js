const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const http = require('http');

const bot = new Telegraf('7589729190:AAEVuQAiWxfKSXuiqEB4_DY0iXR7GJ-7TIs');
const mongoUri = 'mongodb+srv://lolchat00:ktN0HIEo0sehHbWJ@cluster0.rhb1p.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(mongoUri);
let db;

(async () => {
  try {
    await client.connect();
    db = client.db('telegram_bot');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
})();

const users = new Map();

bot.start(async (ctx) => {
  const userId = ctx.from.id;

  await ctx.reply('Welcome! Use the options below:', {
    reply_markup: {
      keyboard: [
        ['Next', 'Stop'], // Fixed keyboard buttons
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
});

bot.hears('Next', async (ctx) => {
  const userId = ctx.from.id;

  // Check if the user is already searching
  if (users.has(userId) && users.get(userId).status === 'searching') {
    return ctx.reply('You are already searching for a chat!');
  }

  // Set the user to searching
  users.set(userId, { status: 'searching' });
  ctx.reply('Searching for a chat...');

  let connected = false;

  // Find another user who is also searching
  for (const [otherUserId, state] of users.entries()) {
    if (otherUserId !== userId && state.status === 'searching') {
      // Connect the two users
      users.set(userId, { status: 'connected', partner: otherUserId });
      users.set(otherUserId, { status: 'connected', partner: userId });

      connected = true;

      const userProfile = await getUserProfile(userId);
      const partnerProfile = await getUserProfile(otherUserId);

      await bot.telegram.sendMessage(otherUserId, 'You are now connected to a random user! Say hi!');
      await bot.telegram.sendMessage(otherUserId, `👤 Partner Profile:\n${userProfile}`);

      await ctx.reply('You are now connected to a random user! Say hi!');
      await ctx.reply(`👤 Partner Profile:\n${partnerProfile}`);

      break;
    }
  }

  // If no user was found, keep the user in "searching" state
  if (!connected) {
    setTimeout(() => {
      if (users.has(userId) && users.get(userId).status === 'searching') {
        users.delete(userId);
        ctx.reply('No users available right now. Try again later.');
      }
    }, 60000);
  }
});

bot.hears('Stop', async (ctx) => {
  const userId = ctx.from.id;

  const userState = users.get(userId);

  if (userState) {
    if (userState.status === 'connected') {
      const partnerId = userState.partner;

      if (users.has(partnerId)) {
        await bot.telegram.sendMessage(partnerId, 'The other user has left the chat.');
        users.delete(partnerId);
      }
    }

    users.delete(userId);
    ctx.reply('You have stopped searching or left the chat.');
  } else {
    ctx.reply('You are not in a chat or search.');
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;

  const userState = users.get(userId);

  if (userState && userState.status === 'connected') {
    const partnerId = userState.partner;

    if (users.has(partnerId)) {
      await bot.telegram.sendMessage(partnerId, ctx.message.text);
    } else {
      ctx.reply('Your partner has left the chat.');
      users.set(userId, { status: 'searching' });
    }
  } else {
    ctx.reply('You are not connected to any user. Use "Next" to start a new chat.');
  }
});

// Function to fetch user profile from the database
async function getUserProfile(userId) {
  const userCollection = db.collection('users');
  const user = await userCollection.findOne({ userId });

  if (user) {
    return `📌 Name: ${user.name || 'Unknown'}\n📌 Gender: ${user.gender || 'Unknown'}\n📌 Country: ${user.country || 'Unknown'}`;
  } else {
    return 'No profile information available.';
  }
}

// Keep-alive server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write("I'm alive");
  res.end();
});

server.listen(8080, () => {
  console.log('Keep alive server is running on port 8080');
});

bot.launch();
console.log('Bot is running!');
