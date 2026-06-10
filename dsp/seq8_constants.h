/*
 * Shared SEQ8 constants and immutable lookup tables.
 *
 * Keep this header free of runtime state and host calls. seq8.c remains the
 * single translation unit for now; this file makes the timing/model contract
 * explicit before larger extractions.
 */
#ifndef SEQ8_CONSTANTS_H
#define SEQ8_CONSTANTS_H

#include <stdint.h>

#define SEQ8_LOG_PATH            "/data/UserData/schwung/seq8.log"
#define SEQ8_PAD_DROP_LOG_PATH   "/data/UserData/schwung/seq8-pad-drop.log"
#define SEQ8_STATE_PATH_FALLBACK "/data/UserData/schwung/seq8-state.json"

#define NUM_TRACKS          8
#define NUM_CLIPS           16

#define ROUTE_SCHWUNG  0
#define ROUTE_MOVE     1
#define ROUTE_EXTERNAL 2

#define EXT_QUEUE_SIZE 64

#define PAD_MODE_MELODIC_SCALE  0
#define PAD_MODE_DRUM           1

#define DRUM_LANES          32
#define DRUM_BASE_NOTE      36

#define BPM_DEFAULT         140
#define PPQN                96
#define TICKS_PER_STEP      24
#define GATE_TICKS          12
#define SEQ_STEPS           256
#define SEQ_STEPS_DEFAULT   16
#define SEQ_NOTE            60
#define SEQ_VEL             100

#define MAX_PFX_EVENTS      256
#define MAX_GEN_NOTES       6
#define MAX_REPEATS         16
#define NUM_CLOCK_VALUES    17
#define DEFAULT_DELAY_TIME_IDX       10
#define DEFAULT_DRUM_DELAY_TIME_IDX   5
#define MAX_DELAY_SAMPLES   (30ULL * 44100)

#define TICKS_TO_480PPQN    5
#define NUM_GATE_FIXED      10

#define CC_AUTO_MAX_POINTS  1024
#define CC_TOUCH_GRACE_BLOCKS 8
#define AT_MAX_LANES       12
#define AT_MAX_POINTS      512
#define AT_LANE_FREE       254
#define AT_LANE_CHAN       255

#define ARP_MAX_HELD        16
#define ARP_MAX_OCTAVES     4
#define ARP_MAX_CYCLE       (ARP_MAX_HELD * ARP_MAX_OCTAVES)
#define ARP_RATE_DEFAULT    1

#define MAX_NOTES_PER_CLIP  512
#define DRUM_PFX_MAX_EVENTS 64

/* Scale-aware play effects: interval tables matching JS SCALE_INTERVALS order. */
static const uint8_t SCALE_IVLS[14][8] = {
    {0, 2, 4, 5, 7, 9,11, 0},
    {0, 2, 3, 5, 7, 8,10, 0},
    {0, 2, 3, 5, 7, 9,10, 0},
    {0, 1, 3, 5, 7, 8,10, 0},
    {0, 2, 4, 6, 7, 9,11, 0},
    {0, 2, 4, 5, 7, 9,10, 0},
    {0, 1, 3, 5, 6, 8,10, 0},
    {0, 2, 3, 5, 7, 8,11, 0},
    {0, 2, 3, 5, 7, 9,11, 0},
    {0, 2, 4, 7, 9, 0, 0, 0},
    {0, 3, 5, 7,10, 0, 0, 0},
    {0, 3, 5, 6, 7,10, 0, 0},
    {0, 2, 4, 6, 8,10, 0, 0},
    {0, 2, 3, 5, 6, 8, 9,11},
};
static const uint8_t SCALE_SIZES[14] = {7,7,7,7,7,7,7,7,7,5,5,6,6,8};

static const uint16_t TPS_VALUES[6] = {12, 24, 48, 96, 192, 384};

static const int CLOCK_VALUES[NUM_CLOCK_VALUES] = {
    30, 45, 60, 80, 90, 120, 160, 180, 240, 320, 360, 480, 720, 960, 1440, 1920, 2880
};

static const int GATE_FIXED_TICKS[NUM_GATE_FIXED] = {
    6, 12, 16, 24, 32, 48, 64, 96, 192, 384
};

static const uint32_t QUANT_STEPS[6] = {1, 1, 2, 4, 8, 16};

static const uint16_t ARP_RATE_TICKS[10] = { 12, 24, 16, 48, 32, 96, 64, 192, 128, 384 };

static const uint16_t DRUM_REPEAT_RATE_TICKS[8] = { 12, 24, 48, 96, 8, 16, 32, 64 };

static const uint8_t DRUM_INQ_TICKS[9] = { 0, 6, 12, 24, 16, 48, 32, 96, 64 };

static const uint8_t CC_ASSIGN_DEFAULT[8] = { 7, 74, 71, 73, 72, 91, 93, 10 };

#endif /* SEQ8_CONSTANTS_H */
