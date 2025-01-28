const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const http = require('http');
const bot = new Telegraf('7589729190:AAEVuQAiWxfKSXuiqEB4_DY0iXR7GJ-7TIs');
const mongoUri = 'mongodb+srv://lolchat00:ktN0HIEo0sehHbWJ@cluster0.rhb1p.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // Replace with your MongoDB URI
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
const users = new Map(); // To track temporary states
bot.start(async (ctx) => {
  if (!db) {
    return ctx.reply('Database is not available. Please try again later.');
  }
  const userId = ctx.from.id;
  const userCollection = db.collection('users');
  // Check if user exists in the database
  const user = await userCollection.findOne({ userId });
  if (!user) {
    // New user, start profile creation
    await ctx.reply('Welcome! Let’s set up your profile. Please send your name:');
    users.set(userId, { status: 'awaiting_name' });
  } else {
    // Existing user, show main menu
    ctx.reply('Welcome back! Choose an option:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Next', callback_data: 'next' },
            { text: 'Stop', callback_data: 'stop' },
          ],
        ],
      },
    });
  }
});

bot.on('text', async (ctx) => {
  if (!db) {
    return ctx.reply('Database is not available. Please try again later.');
  }
  const userId = ctx.from.id;
  const userState = users.get(userId);
  if (userState) {
    if (userState.status === 'awaiting_name') {
      users.set(userId, { ...userState, name: ctx.message.text, status: 'awaiting_age' });
      ctx.reply('Great! Now, please send your age:');
    } else if (userState.status === 'awaiting_age') {
      const age = parseInt(ctx.message.text, 10);
      if (isNaN(age) || age <= 0) {
        ctx.reply('Please enter a valid age.');
        return;
      }
      users.set(userId, { ...userState, age, status: 'awaiting_gender' });
      ctx.reply('Select your gender:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Male', callback_data: 'gender_male' },
              { text: 'Female', callback_data: 'gender_female' },
            ],
          ],
        },
      });
    } else if (userState.status === 'connected') {
      const partnerId = userState.partner;
      if (users.has(partnerId)) {
        // Send the message to the partner
        await bot.telegram.sendMessage(partnerId, `${ctx.from.first_name}: ${ctx.message.text}`);
      }
    }
  } else {
    ctx.reply('Use the buttons to start a new chat or stop searching.');
  }
});

bot.on('callback_query', async (ctx) => {
  if (!db) {
    return ctx.reply('Database is not available. Please try again later.');
  }
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const userCollection = db.collection('users');

  if (data === 'gender_male' || data === 'gender_female') {
    const gender = data === 'gender_male' ? 'Male' : 'Female';
    const userState = users.get(userId);
    if (userState && userState.status === 'awaiting_gender') {
      users.set(userId, { ...userState, gender, status: 'awaiting_language' });
      await ctx.answerCbQuery();
      ctx.reply('Select your preferred language:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Français', callback_data: 'lang_french' },
              { text: 'English', callback_data: 'lang_english' },
            ],
            [
              { text: 'Русский', callback_data: 'lang_russian' },
              { text: 'Other', callback_data: 'lang_other' },
            ],
          ],
        },
      });
    }
  } else if (data.startsWith('lang_')) {
    const language = data.replace('lang_', '');
    const userState = users.get(userId);
    if (userState && userState.status === 'awaiting_language') {
      const userProfile = {
        userId,
        name: userState.name,
        age: userState.age,
        gender: userState.gender,
        language,
        createdAt: new Date(),
      };
      await userCollection.insertOne(userProfile);
      users.delete(userId);
      await ctx.answerCbQuery();
      ctx.reply('Profile created successfully! You can now use the chat bot. Choose an option:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Next', callback_data: 'next' },
              { text: 'Stop', callback_data: 'stop' },
            ],
          ],
        },
      });
    }
  } else if (data === 'next') {
    if (users.has(userId) && users.get(userId).status === 'searching') {
      ctx.answerCbQuery('You are already searching for a chat!');
      return;
    }
    users.set(userId, { status: 'searching' });
    ctx.answerCbQuery('Searching for a chat...');
    let connected = false;
    for (const [otherUserId, state] of users.entries()) {
      if (otherUserId !== userId && state.status === 'searching') {
        // Connect the two users
        users.set(userId, { status: 'connected', partner: otherUserId });
        users.set(otherUserId, { status: 'connected', partner: userId });
        connected = true;

        // Retrieve profiles from the database
        const userProfile = await userCollection.findOne({ userId });
        const partnerProfile = await userCollection.findOne({ userId: otherUserId });

        // Send the profile to both users (exchanging profiles)
        const userProfileMessage = `👤 Your Profile:\n📌 Name: ${userProfile.name}\n📌 Gender: ${userProfile.gender}\n📌 Age: ${userProfile.age}`;
        const partnerProfileMessage = `👤 Partner Profile:\n📌 Name: ${partnerProfile.name}\n📌 Gender: ${partnerProfile.gender}\n📌 Age: ${partnerProfile.age}`;

        await bot.telegram.sendMessage(userId, partnerProfileMessage);  // Send partner's profile to the user
        await bot.telegram.sendMessage(otherUserId, userProfileMessage);  // Send user's profile to the partner

        // Send the common buttons (Next and Stop) to both users
        const buttons = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Next', callback_data: 'next' },
                { text: 'Stop', callback_data: 'stop' },
              ],
            ],
          },
        };

        await bot.telegram.sendMessage(userId, 'You are now connected to a random user! Say hi!', buttons);
        await bot.telegram.sendMessage(otherUserId, 'You are now connected to a random user! Say hi!', buttons);

        break;
      }
    }
    if (!connected) {
      setTimeout(() => {
        if (users.has(userId) && users.get(userId).status === 'searching') {
          users.delete(userId);
          ctx.reply('No users available right now. Try again later.');
        }
      }, 60000);
    }
  } else if (data === 'stop') {
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
      ctx.answerCbQuery('You have left the chat.');
      ctx.reply('You have stopped searching or left the chat.');
    } else {
      ctx.answerCbQuery('You are not in a chat or search.');
    }
  }
});

bot.command('meuf', async (ctx) => {
  const userId = ctx.from.id;
  const userCollection = db.collection('users');
  try {
    await userCollection.updateOne(
      { userId },
      { $set: { gender: 'Female' } },
      { upsert: true }
    );
    ctx.reply('Your gender is now set to Female.');
  } catch (err) {
    console.error(err);
    ctx.reply('An error occurred while setting your gender.');
  }
});

bot.command('mec', async (ctx) => {
  const userId = ctx.from.id;
  const userCollection = db.collection('users');
  try {
    await userCollection.updateOne(
      { userId },
      { $set: { gender: 'Male' } },
      { upsert: true }
    );
    ctx.reply('Your gender is now set to Male.');
  } catch (err) {
    console.error(err);
    ctx.reply('An error occurred while setting your gender.');
  }
});

bot.command('deleteprofile', async (ctx) => {
  const userId = ctx.from.id;
  const userCollection = db.collection('users');
  try {
    await userCollection.deleteOne({ userId });
    ctx.reply('Your profile has been deleted.');
  } catch (err) {
    console.error(err);
    ctx.reply('An error occurred while deleting your profile.');
  }
});

bot.launch();
console.log('Bot is running!');

// Créez un serveur HTTP simple qui renvoie "I'm alive" lorsque vous accédez à son URL
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("I'm alive");
    res.end();
});

// Écoutez le port 8080
server.listen(8080, () => {
    console.log("Keep alive server is running on port 8080");
});
