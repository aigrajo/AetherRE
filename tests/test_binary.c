#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Simple struct for testing
typedef struct {
    int id;
    char name[32];
} Record;

// Global variable
const char* program_name = "AetherRE Test Binary";

// Function with parameters and local variables
int process_data(int count, const char* input) {
    if (count <= 0 || input == NULL) {
        printf("Invalid input\n");
        return -1;
    }
    
    int result = 0;
    for (int i = 0; i < count; i++) {
        result += input[i];
    }
    
    return result;
}

// Function that calls other functions
void analyze_string(const char* str) {
    if (str == NULL) {
        printf("Null string\n");
        return;
    }
    
    int len = strlen(str);
    printf("String length: %d\n", len);
    
    int sum = process_data(len, str);
    printf("Sum of character values: %d\n", sum);
}

// Function with a static array and a loop
void print_records(Record* records, int count) {
    printf("Records:\n");
    for (int i = 0; i < count; i++) {
        printf("  ID: %d, Name: %s\n", records[i].id, records[i].name);
    }
}

// Main function
int main(int argc, char** argv) {
    printf("Starting %s\n", program_name);
    
    if (argc < 2) {
        printf("Usage: %s <string>\n", argv[0]);
        return 1;
    }
    
    // Call functions
    analyze_string(argv[1]);
    
    // Create and use records
    Record records[3];
    records[0].id = 1;
    strcpy(records[0].name, "First");
    records[1].id = 2;
    strcpy(records[1].name, "Second");
    records[2].id = 3;
    strcpy(records[2].name, "Third");
    
    print_records(records, 3);
    
    return 0;
} 