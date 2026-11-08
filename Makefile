CXX = ccache g++
CXXFLAGS_EXTRA =

LDFLAGS = -lGL -ldl -lpthread -lX11 /usr/local/lib/libglfw3.a

TARGET  = testbench
CXXFLAGS = -MMD -MP -std=c++20 -Wall -O2 -Iinclude -Iinclude/imgui $(CXXFLAGS_EXTRA)

SRCS = $(wildcard *.cpp src/*.cpp src/*.c src/portaudio/*.c src/imgui/*.cpp)

# Map each source to its object under build/, preserving directory structure.
OBJS = $(patsubst %.cpp,build/%.o,$(patsubst %.c,build/%.o,$(SRCS)))
DEPS = $(OBJS:.o=.d)

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(OBJS) -o $@ $(LDFLAGS)

# Pattern rules: build/foo/bar.o <- foo/bar.cpp (or .c)
build/%.o: %.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c $< -o $@

build/%.o: %.c
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	$(RM) -r build $(TARGET)

-include $(DEPS)

.PHONY: all clean
