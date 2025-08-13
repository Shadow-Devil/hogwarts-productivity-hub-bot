import { client } from "../client.ts";

export async function alertOwner(message: string): Promise<void> {
    if (process.env.OWNER_ID) {
        const user = await client.users.fetch(process.env.OWNER_ID!)
        await user.send(message);
    }
}

export async function wrapWithAlerting<T>(fn: () => Promise<T>, alertMessage: string): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        await alertOwner(`An error occurred: ${error}\n\nDetails: ${alertMessage}`);

        console.error("Error in wrapped function:", error);
        throw error;
    }
}