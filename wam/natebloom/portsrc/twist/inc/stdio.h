/* the port has no stdio: Plaits' TEST build prints flash writes with printf (rt.cpp defines a stub) */
#pragma once
extern "C" int printf(const char *, ...);
