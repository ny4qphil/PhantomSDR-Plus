// chat.cpp
#include "spectrumserver.h"
#include "chat.h"
#include <chrono>
#include <iomanip>
#include <sstream>
#include <algorithm>
#include <fstream>
#include <regex>

std::set<websocketpp::connection_hdl, std::owner_less<websocketpp::connection_hdl>> ChatClient::chat_connections;
std::deque<std::string> ChatClient::chat_messages_history;
bool ChatClient::is_history_loaded = false;

const std::set<std::string> ChatClient::blocked_usernames = {
    "admin", "operator", "host", "root", "system", "moderator"
};

const std::set<std::string> ChatClient::blocked_words = {
    "fuck", "fucking", "bitch", "shit", "ass", "bitch", "cunt", "bastard", "idiot", "moron", "dumb", "stupid", "loser", "dummy", "moron", "retard", "dumbass", "asshole", "idiot"
};

ChatClient::ChatClient(connection_hdl hdl, PacketSender &sender)
    : Client(hdl, sender, CHAT) {
    if (!is_history_loaded) {
        load_chat_history();
        is_history_loaded = true;
    }
    on_open_chat(hdl);
}

std::string ChatClient::get_or_generate_username(const std::string& user_id) {
    auto it = user_id_to_name.find(user_id);
    if (it != user_id_to_name.end()) {
        return it->second;
    } else {
        std::hash<std::string> hasher;
        auto hashed = hasher(user_id);
        std::string numeric_part = std::to_string(hashed).substr(0, 6);
        std::string username = "user" + numeric_part;
        
        if (is_valid_username(username)) {
            user_id_to_name[user_id] = username;
            return username;
        } else {
            return get_or_generate_username(user_id + "1");
        }
    }
}

bool ChatClient::is_valid_username(const std::string& username) {
    return blocked_usernames.find(username) == blocked_usernames.end();
}

std::string ChatClient::filter_message(const std::string& message) {
    std::string filtered_message = message;

    // Filter out swear words
    for (const auto& word : blocked_words) {
        std::regex word_regex("\\b" + word + "\\b", std::regex_constants::icase);
        filtered_message = std::regex_replace(filtered_message, word_regex, std::string(word.length(), '*'));
    }

    return filtered_message;
}


void ChatClient::store_chat_message(const std::string& message) {
    if(chat_messages_history.size() >= 20) 
    {
        chat_messages_history.pop_front();
    }
    else
    {
        chat_messages_history.push_back(message);
    }
    save_chat_history();
}

std::string ChatClient::get_chat_history_as_string() {
    std::string history;
    for (const auto& msg : chat_messages_history) {
        history += msg + "\n";
    }
    return history;
}

void ChatClient::on_chat_message(connection_hdl sender_hdl, std::string& username, std::string& message) {
    // Input validation
    const size_t MAX_USERNAME_LENGTH = 14;
    const size_t MAX_MESSAGE_LENGTH = 200;

     // Trim leading and trailing spaces from the username
    username.erase(0, username.find_first_not_of(" \t\n\r\f\v"));
    username.erase(username.find_last_not_of(" \t\n\r\f\v") + 1);

    if (username.length() > MAX_USERNAME_LENGTH) {
        username = username.substr(0, MAX_USERNAME_LENGTH);
    }

    if (message.length() > MAX_MESSAGE_LENGTH) {
        message = message.substr(0, MAX_MESSAGE_LENGTH);
    }

    // Check if the username is blocked
    if (!is_valid_username(username)) {
        // Generate a random username
        std::string random_username = "user" + std::to_string(rand() % 1000000);
        printf("Blocked username '%s' detected. Assigned random username: %s\n", username.c_str(), random_username.c_str());
        username = random_username;
    }

    auto now = std::chrono::system_clock::now();
    auto now_c = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&now_c), "%Y-%m-%d %H:%M:%S");
    std::string timestamp = ss.str();

    std::string filtered_message = filter_message(message);
    std::string formatted_message = timestamp + " " + username + ": " + filtered_message;

    store_chat_message(formatted_message);

    for (const auto& conn : chat_connections) {
        sender.send_text_packet(conn, formatted_message);
    }
}

void ChatClient::on_open_chat(connection_hdl hdl) {
    chat_connections.insert(hdl);
    if (!chat_messages_history.empty()) {
        std::string history = "Chat history:\n" + get_chat_history_as_string();
        sender.send_text_packet(hdl, history);
    }
}

void ChatClient::on_close_chat(connection_hdl hdl) {
    chat_connections.erase(hdl);
}

void ChatClient::load_chat_history() {
    std::ifstream file("chat_history.txt");
    std::string line;
    while (std::getline(file, line) && chat_messages_history.size() < 20) {
        chat_messages_history.push_back(line);
    }
    file.close();
}

void ChatClient::save_chat_history() {
    std::ofstream file("chat_history.txt", std::ios::trunc);
    for (const auto& msg : chat_messages_history) {
        file << msg << std::endl;
    }
    file.close();
}
