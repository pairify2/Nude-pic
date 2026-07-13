const TelegramBot = require('node-telegram-bot-api');

// Replace with your bot token from BotFather
const BOT_TOKEN = '8473397663:AAGmPwPQmbkuapVz9PJAbaNusM6dVicLt2Q';

// Create bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store chats (groups and channels)
let chats = {};

// Store pending links
let pendingLinks = {};

console.log('Bot started!');

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    const welcomeMessage = `🤖 *Link Poster Bot*

How to use:
1️⃣ Send me a link with description
2️⃣ I'll show you a preview
3️⃣ Click button to post to all groups/channels

Example:
\`https://youtube.com/watch?v=abc Amazing video!\`

Commands:
/help - Show help
/groups - List all groups/channels`;

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `📋 *How to Post Links*

*Step 1:* Send me a message like:
\`https://example.com Check this out!\`

*Step 2:* I'll detect the link and show preview

*Step 3:* Click "Post to All" button

💡 *Tips:*
• Link must start with http:// or https://
• Add description after the link
• Bot must be admin in channels
• Bot must have send permission in groups`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Handle /groups command
bot.onText(/\/groups/, (msg) => {
    const chatId = msg.chat.id;
    
    const groupList = Object.values(chats).filter(chat => 
        chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel'
    );
    
    if (groupList.length === 0) {
        bot.sendMessage(chatId, '❌ No groups or channels found.');
        return;
    }
    
    let message = '📢 *Groups & Channels:*\n\n';
    groupList.forEach((chat, index) => {
        const type = chat.type === 'channel' ? '📢 Channel' : '👥 Group';
        message += `${index + 1}. ${type}: ${chat.title}\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Function to check if text contains URL
function hasURL(text) {
    const urlPattern = /https?:\/\/[^\s]+/;
    return urlPattern.test(text);
}

// Function to extract URL from text
function extractURL(text) {
    const urlPattern = /(https?:\/\/[^\s]+)/;
    const match = text.match(urlPattern);
    return match ? match[1] : null;
}

// Handle text messages
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Only process private messages
    if (msg.chat.type !== 'private') {
        return;
    }
    
    // Check if message contains URL
    if (!hasURL(text)) {
        bot.sendMessage(chatId, 
            '❌ No URL detected.\n\nPlease send a message with a link:\n`https://example.com Your description here`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Extract URL and description
    const url = extractURL(text);
    const description = text.replace(url, '').trim() || 'Check out this link!';
    
    // Store pending link
    pendingLinks[chatId] = {
        url: url,
        description: description,
        fullText: text
    };
    
    // Create preview message
    const previewMessage = `🔗 *Link Preview*

*URL:* \`${url}\`

*Description:* ${description}

Ready to post?`;
    
    // Create inline keyboard
    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ Post to All Groups/Channels', callback_data: 'post_all' },
                { text: '❌ Cancel', callback_data: 'cancel' }
            ]
        ]
    };
    
    bot.sendMessage(chatId, previewMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

// Handle callback queries (button clicks)
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    
    bot.answerCallbackQuery(query.id);
    
    if (query.data === 'cancel') {
        delete pendingLinks[chatId];
        bot.editMessageText('❌ Posting cancelled.', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        return;
    }
    
    if (query.data === 'post_all') {
        // Check if user has pending link
        if (!pendingLinks[chatId]) {
            bot.editMessageText('⚠️ No pending link found.', {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }
        
        const linkData = pendingLinks[chatId];
        const url = linkData.url;
        const description = linkData.description;
        
        // Get all groups and channels
        const targets = Object.entries(chats).filter(([id, chat]) => 
            chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel'
        );
        
        if (targets.length === 0) {
            bot.editMessageText('⚠️ No groups or channels found!', {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }
        
        // Format message to post
        const postMessage = `🔗 *${description}*\n\n${url}`;
        
        let successCount = 0;
        let failCount = 0;
        
        // Post to all targets
        const promises = targets.map(async ([targetId, chatInfo]) => {
            try {
                await bot.sendMessage(targetId, postMessage, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false
                });
                successCount++;
            } catch (error) {
                console.error(`Failed to post to ${chatInfo.title}:`, error.message);
                failCount++;
            }
        });
        
        // Wait for all posts to complete
        Promise.all(promises).then(() => {
            delete pendingLinks[chatId];
            
            let resultMessage = `✅ *Posted Successfully!*\n\n`;
            resultMessage += `✓ Posted to ${successCount} group(s)/channel(s)`;
            if (failCount > 0) {
                resultMessage += `\n✗ Failed: ${failCount}`;
            }
            
            bot.editMessageText(resultMessage, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            });
        });
    }
});

// Track when bot is added to groups/channels
bot.on('new_chat_members', (msg) => {
    const chat = msg.chat;
    const chatId = chat.id;
    
    // Store chat info
    chats[chatId] = {
        title: chat.title || 'Unknown',
        type: chat.type,
        username: chat.username
    };
    
    console.log(`Bot added to: ${chat.title} (${chat.type})`);
    
    // Send welcome message if added to group/channel
    if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
        bot.sendMessage(chatId, 
            '✅ Bot added! Send me links in private chat and I\'ll post them here.'
        );
    }
});

// Also track when bot joins via invite link
bot.on('my_chat_member', (msg) => {
    const chat = msg.chat;
    const chatId = chat.id;
    
    if (msg.new_chat_member.status === 'member' || msg.new_chat_member.status === 'administrator') {
        chats[chatId] = {
            title: chat.title || 'Unknown',
            type: chat.type,
            username: chat.username
        };
        
        console.log(`Bot joined: ${chat.title} (${chat.type})`);
    }
});

// Handle errors
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('Bot error:', error.message);
});