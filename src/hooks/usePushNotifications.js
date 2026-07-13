import { useEffect } from "react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

function getProjectId() {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.manifest2?.extra?.eas?.projectId ||
    null
  );
}

export function usePushNotifications({ API_BASE_URL, session }) {
  useEffect(() => {
    let isCancelled = false;

    async function registerPushToken() {
      if (Platform.OS === "web" || !session?.access_token) {
        return;
      }

      const projectId = getProjectId();
      if (!projectId) {
        console.warn("Expo push projectId is missing.");
        return;
      }

      const currentPermission = await Notifications.getPermissionsAsync();
      const finalPermission =
        currentPermission.status === "granted"
          ? currentPermission
          : await Notifications.requestPermissionsAsync();

      if (finalPermission.status !== "granted" || isCancelled) {
        return;
      }

      const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!pushToken?.data || isCancelled) {
        return;
      }

      await fetch(`${API_BASE_URL}/api/push-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: Platform.OS,
          token: pushToken.data,
        }),
      }).catch((error) => {
        console.warn("Failed to register push token:", error?.message || error);
      });
    }

    registerPushToken().catch((error) => {
      console.warn("Push notification setup failed:", error?.message || error);
    });

    return () => {
      isCancelled = true;
    };
  }, [API_BASE_URL, session?.access_token]);
}
