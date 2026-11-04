import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getFriendsStatuses, searchProfileByPhone, type FriendStatus } from "@/lib/friends.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { UserPlus, Phone, Search, X } from "lucide-react";
import { normalizePhone } from "@/lib/phone";

export const Route = createFileRoute("/friends")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الأصدقاء | ممنون" },
      { name: "description", content: "إدارة الأصدقاء ومتابعة حالتهم في تطبيق ممنون." },
      { property: "og:title", content: "الأصدقاء | ممنون" },
      { property: "og:description", content: "إدارة الأصدقاء ومتابعة حالتهم في تطبيق ممنون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Friends,
});

function Friends() {
  const { session } = useAuth();
  const [friends, setFriends] = useState<FriendStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const getStatusesFn = useServerFn(getFriendsStatuses);
  const searchProfilesFn = useServerFn(searchProfileByPhone);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStatusesFn();
      setFriends(data as FriendStatus[]);
    } catch {
      toast.error("Failed to load friends");
    } finally {
      setLoading(false);
    }
  }, [getStatusesFn]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  async function doSearch() {
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const rows = await searchProfilesFn({ data: { phone: search.trim() } });
      setResults(rows as any[]);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function addFriend(phone: string) {
    const userId = session?.user.id;
    if (!userId) {
      toast.error("سجّل الدخول أولاً");
      return;
    }
    setAdding(phone);
    try {
      const normalized = normalizePhone(phone);
      const { error } = await (supabase as any).from("friends").insert({
        user_id: userId,
        friend_phone: normalized,
      });
      if (error) throw error;
      toast.success("Friend added");
      setSearch("");
      setResults([]);
      loadFriends();
    } catch (e: any) {
      toast.error(e.message || "Failed to add friend");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="container max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Friends</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Friend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search by phone number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="flex-1"
            />
            <Button onClick={doSearch} disabled={searching} size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {searching && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="space-y-2">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={r.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {r.full_name?.[0]?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{r.full_name ?? "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">{r.phone}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addFriend(r.phone)}
                    disabled={adding === r.phone}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!searching && search.trim() && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No users found with that phone number.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Friends</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              You haven't added any friends yet.
            </p>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => (
                <div
                  key={f.friend_id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={f.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {f.full_name?.[0]?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{f.full_name ?? "Unknown"}</p>
                      <Badge variant="secondary" className="mt-1">
                        {f.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
