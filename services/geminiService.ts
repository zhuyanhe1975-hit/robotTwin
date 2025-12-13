import { GoogleGenAI } from "@google/genai";
import { RobotModel, AICommandResult } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment variables");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Simplified local analysis
export const analyzeRobotModel = async (model: RobotModel): Promise<string> => {
    return "Use Local Analysis for instant results."; 
};

// Helper for retry logic
async function generateWithRetry(ai: GoogleGenAI, model: string, prompt: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent({ model, contents: prompt });
    } catch (error: any) {
      // Retry on 429 (Too Many Requests) or 503 (Service Unavailable)
      if ((error?.status === 429 || error?.status === 503 || (error?.message && error.message.includes("429"))) && i < retries - 1) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
        console.warn(`Gemini API Error ${error?.status || '429'}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

export const generateControlCode = async (model: RobotModel, jointValues: Record<string, number>, targetTask: string): Promise<AICommandResult> => {
  const ai = getAIClient();
  if (!ai) return { code: "# API Key missing." };

  const prompt = `
  You are an advanced Robot Task Planner.
  
  **Robot Context:**
  - Name: ${model.name}
  - Coordinate System: World Frame is **Z-Axis UP** (Gravity -Z). Ground is XY Plane.
  - End Effector: Assume the last link in the chain.

  **Orientation Guidelines (CRITICAL):**
  - Standard Format: Roll, Pitch, Yaw (radians).
  - **"Facing Down":** The End Effector Z-axis MUST point towards World -Z.
  - **MANDATORY RULE:** For this robot configuration, **Facing Down = Pitch 1.57 (approx PI/2)**.
  - **DO NOT** use Pitch 0 for downward tasks. Pitch 0 usually points horizontally.
  - If the task involves picking, placing, or welding on a horizontal surface, **HARDCODE** orientation to: **{"roll": 0, "pitch": 1.57, "yaw": 0}**.

  **Task:** "${targetTask}"

  **Goal:**
  Generate a sequence of **Cartesian Waypoints** (Position & Orientation) to achieve this task.
  Do NOT calculate Joint Angles. The system has a built-in Kinematics Solver.
  
  **Output Requirements:**
  1. Think about the path geometry (lines, circles, approach points).
  2. Output a **JSON ARRAY** of waypoints in <WAYPOINTS_JSON> tags.
  3. **IMPORTANT:** The content inside <WAYPOINTS_JSON> must be **RAW JSON**. Do NOT use Markdown code blocks (like \`\`\`json) inside the tags. Do NOT add comments (//).
  4. Include a Python snippet showing the logic (for display only).
  
  **Waypoint Format:**
  {
    "x": number (meters),
    "y": number,
    "z": number,
    "roll": number (radians),
    "pitch": number, // MUST BE 1.57 for downward facing
    "yaw": number,
    "speed_factor": number (0.1 to 1.0, optional)
  }

  **Example Output:**
  \`\`\`python
  # Plan: Move to start, then draw arc...
  \`\`\`
  
  <WAYPOINTS_JSON>
  [
    {"x": 0.5, "y": 0.0, "z": 0.5, "roll": 0, "pitch": 1.57, "yaw": 0},
    {"x": 0.5, "y": 0.2, "z": 0.5, "roll": 0, "pitch": 1.57, "yaw": 0}
  ]
  </WAYPOINTS_JSON>
  `;

  try {
    // Switch to gemini-2.5-flash for better rate limits and reliability
    const response = await generateWithRetry(ai, "gemini-2.5-flash", prompt);
    
    const text = response.text || "";
    
    // Extract JSON
    const jsonMatch = text.match(/<WAYPOINTS_JSON>([\s\S]*?)<\/WAYPOINTS_JSON>/);
    let waypoints: any[] | undefined;
    
    if (jsonMatch && jsonMatch[1]) {
        try {
            let jsonStr = jsonMatch[1].trim();
            // Sanitize: Remove markdown code blocks if the AI disobeyed
            jsonStr = jsonStr.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
            // Sanitize: Remove comments (// or #) if accidentally included
            jsonStr = jsonStr.replace(/\/\/.*$/gm, "").replace(/^\s*#.*$/gm, "");
            
            waypoints = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse waypoints JSON", e);
            // Fallback attempt: Try to find array bracket to bracket
            try {
                const arrayMatch = jsonMatch[1].match(/\[([\s\S]*)\]/);
                if (arrayMatch) {
                   const cleanInner = arrayMatch[0].replace(/\/\/.*$/gm, "");
                   waypoints = JSON.parse(cleanInner);
                }
            } catch (e2) {
                console.error("Retry parsing failed", e2);
            }
        }
    }

    const cleanCode = text.replace(/<WAYPOINTS_JSON>([\s\S]*?)<\/WAYPOINTS_JSON>/, "").trim();

    return {
        code: cleanCode.replace(/```python/g, "").replace(/```/g, "").trim(),
        waypoints
    };

  } catch (error: any) {
    console.error("Gemini Task Planner Error:", error);
    if (error?.message?.includes("429") || error?.status === 429) {
        return { code: "# 错误: API 请求过于频繁 (Rate Limit)。\n# 系统正在自动重试，请稍后再试。" };
    }
    return { code: `# 任务规划失败: ${error.message}` };
  }
};