import { ActionPanel, Detail, List, Action } from "@raycast/api";
import { useEffect, useState } from "react";
import { authorize, client } from "./utils/googleOauth";
import { calendar_v3 } from "googleapis/build/src/apis/calendar/v3";
import dayjs from "dayjs";

const calenderClient = new calendar_v3.Calendar({});

const zoomUrlRegex = /^https:\/\/\S+?\.zoom\./;

type MeetingState = {
  meetings: { event: calendar_v3.Schema$Event; url: string }[];
  isLoading: boolean;
  error?: string;
};

export default function Command() {
  const state = useMeetingInCalendar();

  if (state.error) {
    return <Detail markdown={state.error} />;
  }

  return (
    <List isLoading={state.isLoading}>
      {state.meetings.map((meeting) => (
        <List.Item
          key={meeting.event.id}
          icon="list-icon.png"
          title={meeting.event.summary || "名称未設定"}
          actions={
            <ActionPanel>
              <Action.Open target={meeting.url} application="us.zoom.xos" title="Open by Zoom" />
              <Action.OpenInBrowser url={meeting.url} title="Open in browser" />
              <Action.Push target={<Detail markdown={JSON.stringify(meeting.event, null, 4)} />} title="Show Data" />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function useMeetingInCalendar() {
  const [state, setState] = useState<MeetingState>({ meetings: [], isLoading: true });

  useEffect(() => {
    (async () => {
      // 認証・トークン取得
      await authorize(["https://www.googleapis.com/auth/calendar.readonly"]);
      const token = await client.getTokens();

      if (!token?.accessToken) {
        setState({ isLoading: false, meetings: [], error: "Error: No access token." });
        return;
      }

      // カレンダー一覧取得
      const calendars = await calenderClient.calendarList
        .list({
          oauth_token: token.accessToken,
          minAccessRole: "owner",
        })
        .catch((e: Error) => {
          setState({ isLoading: false, meetings: [], error: e.message });
        });
      if (!calendars?.data?.items?.[0]?.id) {
        return;
      }

      // 現在時刻前後15分以内の予定を取得
      const now = dayjs();
      const timeMin = now.add(-15, "minutes").toISOString();
      const timeMax = now.add(15, "minutes").toISOString();

      const events = await calenderClient.events
        .list({
          oauth_token: token?.accessToken,
          calendarId: calendars.data.items[0].id,
          timeMin,
          timeMax,
        })
        .catch((e: Error) => {
          setState({ isLoading: false, meetings: [], error: e.message });
        });
      if (!events?.data?.items) {
        return;
      }

      // ミーティングを変換
      const meetings = events.data.items.reduce((meetings, event) => {
        let url;
        if (event.conferenceData?.entryPoints?.[0]?.uri?.match(zoomUrlRegex)) {
          url = event.conferenceData?.entryPoints?.[0]?.uri;
        } else if (event.location?.match(zoomUrlRegex)) {
          url = event.location;
        }
        if (url) {
          meetings.push({ event, url });
        }
        return meetings;
      }, [] as MeetingState["meetings"]);

      setState({
        meetings,
        isLoading: false,
      });
    })();
  }, []);

  return state;
}
