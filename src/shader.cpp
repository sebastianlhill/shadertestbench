#include "shader.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <stdexcept>
#include <vector>

static std::string readFile(const std::string& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw std::runtime_error("Failed to open shader file: " + path);
    }
    std::ostringstream ss;
    ss << file.rdbuf();
    return ss.str();
}

static GLuint compileShader(GLenum type, const std::string& source, const std::string& debugName)
{
    GLuint shader = glCreateShader(type);
    const char* src = source.c_str();
    glShaderSource(shader, 1, &src, nullptr);
    glCompileShader(shader);

    GLint success = 0;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &success);
    if (!success) {
        GLint logLen = 0;
        glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &logLen);
        std::vector<char> log(logLen > 1 ? logLen : 1);
        glGetShaderInfoLog(shader, logLen, nullptr, log.data());
        glDeleteShader(shader);
        throw std::runtime_error("Shader compile failed (" + debugName + "):\n" + log.data());
    }
    return shader;
}

GLuint loadShaderProgram(const std::string& vertPath, const std::string& fragPath)
{
    std::string vertSrc = readFile(vertPath);
    std::string fragSrc = readFile(fragPath);

    GLuint vs = compileShader(GL_VERTEX_SHADER,   vertSrc, vertPath);
    GLuint fs = compileShader(GL_FRAGMENT_SHADER, fragSrc, fragPath);

    GLuint program = glCreateProgram();
    glAttachShader(program, vs);
    glAttachShader(program, fs);
    glLinkProgram(program);

    GLint success = 0;
    glGetProgramiv(program, GL_LINK_STATUS, &success);
    if (!success) {
        GLint logLen = 0;
        glGetProgramiv(program, GL_INFO_LOG_LENGTH, &logLen);
        std::vector<char> log(logLen > 1 ? logLen : 1);
        glGetProgramInfoLog(program, logLen, nullptr, log.data());
        glDeleteShader(vs);
        glDeleteShader(fs);
        glDeleteProgram(program);
        throw std::runtime_error("Program link failed:\n" + std::string(log.data()));
    }

    // Shaders are reference-counted by the program, so we can delete them now.
    glDetachShader(program, vs);
    glDetachShader(program, fs);
    glDeleteShader(vs);
    glDeleteShader(fs);

    return program;
}
