#include <stdio.h>
#include <string.h>

#define FLAG_LEN 13

// Simple XOR obfuscation
void xor_transform(char *data, int len, char key) {
    for (int i = 0; i < len; i++) {
        data[i] ^= key;
    }
}

// Core flag verification logic
int verify_flag(char *input) {
    char expected[13] = {
        0x11, 0x09, 0x1b, 0x6f,
        0x10, 0x07, 0x14, 0x07,
        0x6f, 0x76, 0x74, 0x7a, 0x72
};

    char local[FLAG_LEN];
    strncpy(local, input, FLAG_LEN);
    xor_transform(local, FLAG_LEN, 0x42);  // XOR with 0x42

    return memcmp(local, expected, FLAG_LEN) == 0;
}

// Decoy function
void useless_fn1() {
    int x = 1337;
    int y = x * 42;
    printf("Debug: %d\n", y);
}

// Another red herring
void anti_debug() {
    volatile int check = 0;
    for (int i = 0; i < 1000; i++) {
        check += i;
    }
    if (check == 500500) {
        puts("Debugger detected?");
    }
}

int main() {
    char user_input[64];

    puts("=== Welcome to the CTF Challenge ===");
    printf("Enter the flag: ");
    fgets(user_input, sizeof(user_input), stdin);
    user_input[strcspn(user_input, "\n")] = 0;

    // Indirect function call to obscure logic
    void (*checker)(char*) = (void (*)(char*))verify_flag;

    if (((int (*)(char*))checker)(user_input)) {
        puts("Correct! Here is your reward.");
    } else {
        puts("Wrong flag. Try again.");
    }

    return 0;
}