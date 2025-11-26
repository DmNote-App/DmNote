// @id v-archive-tier

/**
 * V-ARCHIVE Tier Display Plugin
 *
 * DM Note 키뷰어에 V-ARCHIVE 티어 정보를 표시하는 플러그인입니다.
 * 우클릭 컨텍스트 메뉴에서 패널을 추가할 수 있습니다.
 *
 * API: https://v-archive.net/api/archive/{nickname}/tier/{button}
 */

dmn.plugin.defineElement({
  name: "V-ARCHIVE Tier",

  contextMenu: {
    create: "menu.create",
    delete: "menu.delete",
    items: [
      {
        label: "menu.refresh",
        onClick: ({ actions }) => actions.refresh(),
      },
    ],
  },

  messages: {
    en: {
      "menu.create": "Create V-ARCHIVE Tier Panel",
      "menu.delete": "Delete V-ARCHIVE Tier Panel",
      "menu.refresh": "Refresh Tier Data",
      "settings.nickname": "V-ARCHIVE Nickname",
      "settings.button": "Button Mode",
      "settings.showProgress": "Show Progress Bar",
      "settings.showTop5": "Show Top 5 Songs",
      "settings.bgColor": "Background Color",
      "settings.textColor": "Text Color",
      "settings.accentColor": "Accent Color",
      "status.loading": "Loading...",
      "status.error": "Failed to load",
      "status.notFound": "User not found",
      "status.noTier": "No tier data",
      "status.setNickname": "Set nickname",
      "status.rightClick": "Right-click → Settings",
      "label.tier": "TIER",
      "label.top50": "TOP50",
      "label.next": "Next",
      "label.songs": "songs",
    },
    ko: {
      "menu.create": "V-ARCHIVE 티어 패널 생성",
      "menu.delete": "V-ARCHIVE 티어 패널 삭제",
      "menu.refresh": "티어 데이터 새로고침",
      "settings.nickname": "V-ARCHIVE 닉네임",
      "settings.button": "버튼 모드",
      "settings.showProgress": "진행률 바 표시",
      "settings.showTop5": "TOP 5 곡 표시",
      "settings.bgColor": "배경 색상",
      "settings.textColor": "텍스트 색상",
      "settings.accentColor": "강조 색상",
      "status.loading": "로딩 중...",
      "status.error": "로드 실패",
      "status.notFound": "유저를 찾을 수 없음",
      "status.noTier": "티어 정보 없음",
      "status.setNickname": "닉네임을 설정해주세요",
      "status.rightClick": "우클릭 → 설정",
      "label.tier": "티어",
      "label.top50": "TOP50",
      "label.next": "다음",
      "label.songs": "곡",
    },
  },

  settings: {
    nickname: {
      type: "string",
      default: "",
      label: "settings.nickname",
    },
    button: {
      type: "select",
      default: "4",
      label: "settings.button",
      options: [
        { label: "4B", value: "4" },
        { label: "5B", value: "5" },
        { label: "6B", value: "6" },
        { label: "8B", value: "8" },
      ],
    },
    showProgress: {
      type: "boolean",
      default: true,
      label: "settings.showProgress",
    },
    showTop5: {
      type: "boolean",
      default: false,
      label: "settings.showTop5",
    },
    bgColor: {
      type: "color",
      default: "rgba(17, 17, 20, 0.95)",
      label: "settings.bgColor",
    },
    textColor: {
      type: "color",
      default: "#DBDEE8",
      label: "settings.textColor",
    },
    accentColor: {
      type: "color",
      default: "#A78BFA",
      label: "settings.accentColor",
    },
  },

  template: (state, settings, { html, t }) => {
    const { loading = false, error = null, tierData = null } = state;

    const {
      bgColor = "rgba(17, 17, 20, 0.95)",
      textColor = "#DBDEE8",
      accentColor = "#A78BFA",
      showProgress = true,
      showTop5 = false,
      nickname = "",
      button = "4",
    } = settings;

    // 티어 코드별 색상
    const tierColors = {
      BR: "#CD7F32",
      SV: "#C0C0C0",
      GD: "#FFD700",
      PT: "#E5E4E2",
      DM: "#B9F2FF",
      MS: "#9966CC",
      GM: "#FF6B6B",
    };

    const currentTierColor = tierData?.tier?.code
      ? tierColors[tierData.tier.code] || accentColor
      : accentColor;

    const toNumber = (val) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : null;
    };

    const calculateProgress = () => {
      if (!tierData || !tierData.tier || !tierData.next) return 0;
      const current = toNumber(tierData.tierPoint);
      const tierStart = toNumber(tierData.tier.rating);
      const tierEnd = toNumber(tierData.next.rating);
      if (current === null || tierStart === null || tierEnd === null) return 0;
      const range = tierEnd - tierStart;
      if (range <= 0) return 100;
      return Math.min(100, Math.max(0, ((current - tierStart) / range) * 100));
    };

    const progress = calculateProgress();

    const containerStyle = `
      background: ${bgColor};
      color: ${textColor};
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      width: 200px;
      box-sizing: border-box;
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      cursor: pointer;
      user-select: none;
    `;

    // 로딩 상태
    if (loading && !tierData) {
      return html`
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
        <div style=${containerStyle}>
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 14px;">🎮 V-ARCHIVE</div>
            <div style="font-size: 12px; opacity: 0.7; margin-top: 8px;">
              ${t("status.loading")}
            </div>
          </div>
        </div>
      `;
    }

    // 에러 상태
    if (error) {
      return html`
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
        <div
          style=${containerStyle.replace(
            "rgba(255, 255, 255, 0.1)",
            "rgba(255, 100, 100, 0.3)"
          )}
        >
          <div style="text-align: center; padding: 10px;">
            <span style="font-size: 24px;">⚠️</span>
            <div style="font-size: 12px; margin-top: 8px; color: #F87171;">
              ${error === "notFound"
                ? t("status.notFound")
                : error === "noTier"
                ? t("status.noTier")
                : t("status.error")}
            </div>
            <div style="font-size: 10px; margin-top: 4px; opacity: 0.5;">
              ${nickname || "?"}
            </div>
          </div>
        </div>
      `;
    }

    // 닉네임 미설정
    if (!nickname) {
      return html`
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
        <div style=${containerStyle}>
          <div style="text-align: center;">
            <div style="font-size: 14px; margin-bottom: 8px;">🎮 V-ARCHIVE</div>
            <div style="font-size: 11px; opacity: 0.6;">
              ${t("status.setNickname")}
            </div>
            <div style="font-size: 10px; opacity: 0.4; margin-top: 4px;">
              ${t("status.rightClick")}
            </div>
          </div>
        </div>
      `;
    }

    // 데이터 없음 (로딩 전)
    if (!tierData) {
      return html`
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
        <div style=${containerStyle}>
          <div style="text-align: center;">
            <div style="font-size: 14px;">🎮 V-ARCHIVE</div>
            <div style="font-size: 12px; margin-top: 8px;">${nickname}</div>
            <div style="font-size: 10px; opacity: 0.5; margin-top: 4px;">
              ${button}B
            </div>
          </div>
        </div>
      `;
    }

    // 정상 데이터 표시
    return html`
      <link
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        rel="stylesheet"
      />
      <div style=${containerStyle}>
        <!-- 헤더 -->
        <div
          style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);"
        >
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 14px;">🎮</span>
            <span style="font-size: 13px; font-weight: 600;">${nickname}</span>
          </div>
          <span
            style="font-size: 10px; padding: 2px 8px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; font-weight: 500;"
            >${button}B</span
          >
        </div>

        <!-- 티어 정보 -->
        <div style="text-align: center; margin-bottom: 12px;">
          <div
            style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 4px;"
          >
            ${t("label.tier")}
          </div>
          <div
            style="font-size: 24px; font-weight: 700; color: ${currentTierColor}; text-shadow: 0 0 20px ${currentTierColor}40;"
          >
            ${tierData.tier?.name || "Unknown"}
          </div>
          <div style="font-size: 12px; color: ${accentColor}; margin-top: 4px;">
            ${(() => {
              const num = toNumber(tierData.tierPoint);
              return num !== null
                ? num.toFixed(2)
                : String(tierData.tierPoint ?? "0.00");
            })()}
            RP
          </div>
        </div>

        <!-- 진행률 바 -->
        ${showProgress
          ? html`
              <div style="margin-bottom: 12px;">
                <div
                  style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px; opacity: 0.7;"
                >
                  <span>${tierData.tier?.name || ""}</span>
                  <span>${tierData.next?.name || ""}</span>
                </div>
                <div
                  style="height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;"
                >
                  <div
                    style="height: 100%; width: ${progress}%; background: linear-gradient(90deg, ${currentTierColor}, ${accentColor}); border-radius: 3px; transition: width 0.3s ease;"
                  ></div>
                </div>
                <div
                  style="display: flex; justify-content: space-between; font-size: 9px; margin-top: 4px; opacity: 0.5;"
                >
                  <span>${tierData.tier?.rating || 0}</span>
                  <span>${t("label.next")}: ${tierData.next?.rating || 0}</span>
                </div>
              </div>
            `
          : ""}

        <!-- TOP50 통계 -->
        <div
          style="display: flex; justify-content: space-between; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; font-size: 11px;"
        >
          <div>
            <div style="opacity: 0.6; font-size: 9px;">${t("label.top50")}</div>
            <div style="font-weight: 600;">
              ${(() => {
                const num = toNumber(tierData.top50sum);
                return num !== null
                  ? num.toFixed(2)
                  : String(tierData.top50sum ?? "0.00");
              })()}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="opacity: 0.6; font-size: 9px;">${t("label.songs")}</div>
            <div style="font-weight: 600;">
              ${tierData.topList?.length || 0}
            </div>
          </div>
        </div>

        <!-- TOP 5 곡 목록 -->
        ${showTop5 && tierData.topList?.length > 0
          ? html`
              <div style="margin-top: 12px;">
                <div
                  style="font-size: 10px; opacity: 0.6; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;"
                >
                  TOP 5
                </div>
                ${tierData.topList.slice(0, 5).map(
                  (song, index) => html`
                    <div
                      key=${index}
                      style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px; background: rgba(255, 255, 255, 0.03); border-radius: 4px; font-size: 10px;"
                    >
                      <span
                        style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; background: ${index ===
                        0
                          ? "#FFD700"
                          : index === 1
                          ? "#C0C0C0"
                          : index === 2
                          ? "#CD7F32"
                          : "rgba(255,255,255,0.1)"}; color: ${index < 3
                          ? "#000"
                          : textColor}; border-radius: 3px; font-weight: 700; font-size: 9px;"
                        >${index + 1}</span
                      >
                      <div style="flex: 1; min-width: 0;">
                        <div
                          style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;"
                        >
                          ${song.name}
                        </div>
                        <div style="opacity: 0.5; font-size: 9px;">
                          Lv.${song.level} ${song.pattern}
                        </div>
                      </div>
                      <div style="text-align: right;">
                        <div style="color: ${accentColor}; font-weight: 600;">
                          ${(() => {
                            const num = toNumber(song.rating);
                            return num !== null
                              ? num.toFixed(1)
                              : String(song.rating ?? "");
                          })()}
                        </div>
                        <div style="opacity: 0.5; font-size: 9px;">
                          ${song.score}%
                        </div>
                      </div>
                    </div>
                  `
                )}
              </div>
            `
          : ""}
      </div>
    `;
  },

  previewState: {
    loading: false,
    error: null,
    tierData: {
      success: true,
      top50sum: 8828.52,
      tierPoint: 8999.51,
      tier: { rating: 8800, name: "Platinum I", code: "PT" },
      next: { rating: 9000, name: "Diamond IV", code: "DM" },
      topList: [
        {
          name: "Gone Astray",
          level: 13,
          pattern: "SC",
          rating: "187.528",
          score: "99.80",
        },
        {
          name: "ouroboros",
          level: 14,
          pattern: "SC",
          rating: "184.450",
          score: "99.59",
        },
        {
          name: "Gregorius Symphony",
          level: 13,
          pattern: "SC",
          rating: "182.906",
          score: "99.77",
        },
        {
          name: "Enter The Universe",
          level: 12,
          pattern: "SC",
          rating: "181.721",
          score: "99.68",
        },
        {
          name: "Away",
          level: 12,
          pattern: "SC",
          rating: "181.270",
          score: "99.82",
        },
      ],
    },
  },

  onMount: ({ setState, getSettings, expose, onSettingsChange }) => {
    const AUTO_REFRESH_MS = 5 * 60 * 1000;
    let isMounted = true;

    const fetchTierData = async () => {
      const { nickname, button } = getSettings();

      if (!nickname) {
        setState({ loading: false, error: null, tierData: null });
        return;
      }

      setState({ loading: true, error: null });

      try {
        const encodedNickname = encodeURIComponent(nickname);
        const url = `https://v-archive.net/api/archive/${encodedNickname}/tier/${button}`;

        const response = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!isMounted) return;

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.errorCode === 101) {
            setState({ loading: false, error: "notFound", tierData: null });
          } else if (errorData.errorCode === 111) {
            setState({ loading: false, error: "noTier", tierData: null });
          } else {
            setState({ loading: false, error: "unknown", tierData: null });
          }
          return;
        }

        const data = await response.json();
        if (!isMounted) return;

        if (data.success) {
          setState({ loading: false, error: null, tierData: data });
        } else {
          setState({ loading: false, error: "unknown", tierData: null });
        }
      } catch (err) {
        if (!isMounted) return;
        setState({ loading: false, error: "network", tierData: null });
      }
    };

    expose({
      refresh: () => fetchTierData(),
    });

    // 초기 데이터 로드
    fetchTierData();

    // 설정 변경 감지 - nickname 또는 button이 변경되면 데이터 다시 가져오기
    onSettingsChange((newSettings, oldSettings) => {
      if (
        newSettings.nickname !== oldSettings.nickname ||
        newSettings.button !== oldSettings.button
      ) {
        fetchTierData();
      }
    });

    // 5분마다 자동 새로고침
    const refreshInterval = setInterval(() => {
      if (isMounted) {
        fetchTierData();
      }
    }, AUTO_REFRESH_MS);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  },
});
