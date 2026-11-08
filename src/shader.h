#pragma once 
#include <glad/glad.h>
#include <string>

GLuint loadShaderProgram(const std::string& vertPath, const std::string& fragPath);
