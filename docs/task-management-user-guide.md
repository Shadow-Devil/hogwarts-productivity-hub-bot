# 📋 Task Management Commands - User Guide

## Overview
The Discord productivity bot now includes a complete task management system that integrates with voice channel requirements and the house points system.

## 🎯 Quick Start

### 1. Adding Tasks
Use `/addtask` to create new tasks for yourself:
```
/addtask title:Complete math homework
/addtask title:Study for chemistry exam
/addtask title:Finish Discord bot project
```
- Maximum 500 characters per task
- Tasks are automatically numbered for easy reference

### 2. Viewing Your Tasks
Use `/viewtasks` to see all your tasks:
```
/viewtasks
```
This shows:
- **Pending Tasks**: Numbered list (1, 2, 3...) with creation dates
- **Recently Completed**: Last 5 completed tasks with points earned
- **Statistics**: Total tasks, completed count, pending count, total points

### 3. Completing Tasks (Earn Points!)
Use `/completetask` to mark tasks as complete:
```
/completetask number:1
```
**Requirements:**
- ✅ Must be in a voice channel
- ✅ Must have been in voice channel for at least 20 minutes
- ✅ Task number must be valid (check with `/viewtasks`)

**Rewards:**
- 🎉 2 points per completed task
- 🏆 Points contribute to your house total

### 4. Removing Tasks
Use `/removetask` to delete tasks you no longer need:
```
/removetask number:2
```
- Tasks are permanently removed
- Numbers automatically adjust for remaining tasks

### 5. View Statistics
Use `/stats` to see your complete progress:
```
/stats
```
Now includes both voice channel and task statistics!

## 💡 Pro Tips

### Voice Channel Strategy
- Join a voice channel before starting work sessions
- Stay for at least 20 minutes to unlock task completion
- Complete multiple tasks during long study sessions for maximum points

### Task Organization
- Add tasks at the beginning of study sessions
- Use descriptive titles for easy identification
- Complete tasks as you finish them for instant gratification

### Point Maximization
- **Voice Time**: 5 points/hour (first hour monthly), 2 points/hour (additional)
- **Tasks**: 2 points each
- Combine both for maximum house point contribution!

## 🚫 Common Restrictions

### Voice Channel Requirements
- You cannot complete tasks if you're not in a voice channel
- 20-minute minimum voice time required before task completion
- Requirements reset each time you leave and rejoin voice channels

### Task Limits
- Task titles must be 1-500 characters
- Task numbers are based on creation order
- Cannot complete or remove non-existent tasks

## 🎯 Example Workflow

1. **Start Study Session**
   ```
   /addtask title:Read Chapter 5 of Biology textbook
   /addtask title:Complete algebra problem set
   /addtask title:Write history essay outline
   ```

2. **Join Voice Channel** (stay for 20+ minutes)

3. **Check Your Tasks**
   ```
   /viewtasks
   ```

4. **Complete Tasks as You Finish**
   ```
   /completetask number:1  (+2 points)
   /completetask number:1  (+2 points) [numbers shift down]
   /completetask number:1  (+2 points)
   ```

5. **Check Progress**
   ```
   /stats
   ```

## 🏆 Integration with House System

- All task points contribute to your house total
- Task completion helps your house climb the leaderboards
- Use `/housepoints` to see how your tasks help your house!

---

**Ready to boost your productivity and earn points for your house? Start with `/addtask` and begin your organized study journey!** 🚀
