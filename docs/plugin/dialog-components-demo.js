/**
 * Dialog & Components API Demo Plugin
 *
 * 이 플러그인은 Dialog API와 Components API의 모든 기능을 시연합니다.
 *
 * 기능:
 * - 좌상단에 트리거 버튼 패널 표시 (KPS 플러그인과 유사)
 * - Alert Dialog, Confirm Dialog, Custom Dialog 예제
 * - Button, Checkbox, Input, Dropdown, FormRow 컴포넌트 예제
 * - ui.components는 모달 내부 구성을 위한 API임을 시연
 */

// @id dialog-components-demo

(async () => {
  // 메인 윈도우 전용
  if (window.api.window.type !== "main") return;

  console.log("[Dialog Demo] 플러그인 로드됨");

  // Display Element에서 사용할 이벤트 핸들러 등록
  const handlers = {
    // Alert Dialog 예제
    async showBasicAlert() {
      await window.api.ui.dialog.alert("안녕하세요! 기본 알림입니다.");
    },

    async showCustomAlert() {
      await window.api.ui.dialog.alert("커스텀 알림 메시지입니다.", {
        confirmText: "OK",
      });
    },

    // Confirm Dialog 예제
    async showBasicConfirm() {
      const result = await window.api.ui.dialog.confirm(
        "정말 진행하시겠습니까?"
      );
      await window.api.ui.dialog.alert(
        result ? "확인을 눌렀습니다!" : "취소를 눌렀습니다!"
      );
    },

    async showDangerConfirm() {
      const result = await window.api.ui.dialog.confirm(
        "모든 데이터가 삭제됩니다.\n정말 삭제하시겠습니까?",
        {
          confirmText: "삭제",
          cancelText: "취소",
          danger: true,
        }
      );

      if (result) {
        await window.api.ui.dialog.alert("삭제되었습니다!");
      }
    },

    // Components 예제 - 설정 패널 (Custom Dialog로 표시)
    async showSettingsPanel() {
      // ✨ 개선된 방식: 함수 직접 전달
      const enabledCheckbox = window.api.ui.components.checkbox({
        checked: true,
        id: "demo-enabled",
        onChange: (checked) => {
          console.log("[Demo] 활성화 상태 변경:", checked);
        },
      });

      const themeDropdown = window.api.ui.components.dropdown({
        options: [
          { label: "다크 모드", value: "dark" },
          { label: "라이트 모드", value: "light" },
          { label: "자동", value: "auto" },
        ],
        selected: "dark",
        id: "demo-theme",
        onChange: (value) => {
          console.log("[Demo] 테마 변경:", value);
        },
      });

      const volumeInput = window.api.ui.components.input({
        type: "number",
        value: 50,
        width: 47,
        id: "demo-volume",
        onInput: (value) => {
          console.log("[Demo] 볼륨 변경:", value);
        },
      });

      const nameInput = window.api.ui.components.input({
        placeholder: "이름을 입력하세요",
        value: "User",
        width: 150,
        id: "demo-name",
      });

      // Custom Dialog는 이미 모달 스타일이므로 panel 대신 내용만 전달
      const formHtml = `
        <div class="flex flex-col gap-[12px] max-w-[235.5px]">
          <div class="text-style-3 text-[#FFFFFF] mb-[4px]">샘플 설정</div>
          ${window.api.ui.components.formRow("활성화", enabledCheckbox)}
          ${window.api.ui.components.formRow("테마", themeDropdown)}
          ${window.api.ui.components.formRow("볼륨", volumeInput)}
          ${window.api.ui.components.formRow("사용자 이름", nameInput)}
        </div>
      `;

      // Custom Dialog로 표시 (저장/초기화 버튼 포함)
      const confirmed = await window.api.ui.dialog.custom(formHtml, {
        confirmText: "저장",
        cancelText: "초기화",
        showCancel: true,
      });

      if (confirmed) {
        await handlers.handleSaveSettings();
      } else {
        await handlers.handleResetSettings();
      }
    },

    // Components 예제 - 입력 폼 (Custom Dialog로 표시)
    async showInputForm() {
      const titleInput = window.api.ui.components.input({
        placeholder: "제목 입력",
        width: 200,
        id: "demo-title",
      });

      const descInput = window.api.ui.components.input({
        placeholder: "설명 입력",
        width: 200,
        id: "demo-desc",
      });

      const priorityDropdown = window.api.ui.components.dropdown({
        options: [
          { label: "높음", value: "high" },
          { label: "보통", value: "medium" },
          { label: "낮음", value: "low" },
        ],
        selected: "medium",
        id: "demo-priority",
      });

      const urgentCheckbox = window.api.ui.components.checkbox({
        checked: false,
        id: "demo-urgent",
      });

      // Custom Dialog는 이미 모달 스타일이므로 panel 대신 내용만 전달
      const formHtml = `
        <div class="flex flex-col gap-[12px] max-w-[235.5px]">
          <div class="text-style-3 text-[#FFFFFF] mb-[4px]">새 항목 추가</div>
          ${window.api.ui.components.formRow("제목", titleInput)}
          ${window.api.ui.components.formRow("설명", descInput)}
          ${window.api.ui.components.formRow("우선순위", priorityDropdown)}
          ${window.api.ui.components.formRow("긴급", urgentCheckbox)}
        </div>
      `;

      // Custom Dialog로 표시 (제출/취소 버튼 포함)
      const confirmed = await window.api.ui.dialog.custom(formHtml, {
        confirmText: "제출",
        cancelText: "취소",
        showCancel: true,
      });

      if (confirmed) {
        await handlers.handleFormSubmit();
      }
    },

    // 버튼 쇼케이스 (Custom Dialog로 표시)
    async showButtonShowcase() {
      const primaryBtn = window.api.ui.components.button("Primary", {
        variant: "primary",
        onClick: () => {
          console.log("[Demo] Primary 버튼 클릭");
        },
      });

      const dangerBtn = window.api.ui.components.button("Danger", {
        variant: "danger",
        onClick: () => {
          console.log("[Demo] Danger 버튼 클릭");
        },
      });

      const secondaryBtn = window.api.ui.components.button("Secondary", {
        variant: "secondary",
        onClick: () => {
          console.log("[Demo] Secondary 버튼 클릭");
        },
      });

      const disabledBtn = window.api.ui.components.button("비활성화", {
        disabled: true,
      });

      // Custom Dialog는 이미 모달 스타일이므로 panel 대신 내용만 전달
      const showcaseHtml = `
        <div class="flex flex-col gap-[12px] max-w-[235.5px]">
          <div class="text-style-3 text-[#FFFFFF] mb-[4px]">버튼 스타일</div>
          <div class="flex gap-[10.5px] flex-wrap">
            ${primaryBtn}
            ${dangerBtn}
          </div>
          <div class="flex gap-[10.5px]">
            ${secondaryBtn}
          </div>
          <div>${disabledBtn}</div>
        </div>
      `;

      // Custom Dialog로 표시 (모달 형태)
      await window.api.ui.dialog.custom(showcaseHtml);
    },

    // 설정 저장 핸들러
    async handleSaveSettings() {
      const enabled = document
        .getElementById("demo-enabled")
        ?.querySelector("input")?.checked;
      const theme = document.getElementById("demo-theme")?.value;
      const volume = document.getElementById("demo-volume")?.value;
      const name = document.getElementById("demo-name")?.value;

      const settings = { enabled, theme, volume, name };

      await window.api.plugin.storage.set("demoSettings", settings);
      await window.api.ui.dialog.alert("설정이 저장되었습니다!");

      console.log("[Demo] 저장된 설정:", settings);
    },

    // 설정 초기화 핸들러
    async handleResetSettings() {
      const confirmed = await window.api.ui.dialog.confirm(
        "설정을 초기화하시겠습니까?",
        { danger: true, confirmText: "초기화" }
      );

      if (confirmed) {
        await window.api.plugin.storage.remove("demoSettings");
        await window.api.ui.dialog.alert("초기화되었습니다!");

        // UI 업데이트
        if (document.getElementById("demo-enabled")) {
          document
            .getElementById("demo-enabled")
            .querySelector("input").checked = true;
        }
        if (document.getElementById("demo-theme")) {
          document.getElementById("demo-theme").value = "dark";
        }
        if (document.getElementById("demo-volume")) {
          document.getElementById("demo-volume").value = "50";
        }
        if (document.getElementById("demo-name")) {
          document.getElementById("demo-name").value = "User";
        }
      }
    },

    // 폼 제출 핸들러
    async handleFormSubmit() {
      const title = document.getElementById("demo-title")?.value;
      const desc = document.getElementById("demo-desc")?.value;
      const priority = document.getElementById("demo-priority")?.value;
      const urgent = document
        .getElementById("demo-urgent")
        ?.querySelector("input")?.checked;

      if (!title || !desc) {
        await window.api.ui.dialog.alert("제목과 설명을 입력하세요!");
        return;
      }

      const formData = { title, desc, priority, urgent };

      const confirmed = await window.api.ui.dialog.confirm(
        `제목: ${title}\n설명: ${desc}\n우선순위: ${priority}\n긴급: ${
          urgent ? "예" : "아니오"
        }\n\n제출하시겠습니까?`
      );

      if (confirmed) {
        console.log("[Demo] 제출된 데이터:", formData);
        await window.api.ui.dialog.alert("제출되었습니다!");
      }
    },

    // 폼 취소 핸들러
    handleFormCancel() {
      console.log("[Demo] 폼 취소됨");
    },
  };

  // 전역 핸들러 등록
  Object.keys(handlers).forEach((key) => {
    window[key] = handlers[key];
  });

  // 트리거 버튼 패널 생성 (KPS 플러그인처럼 직접 DOM 추가)
  const triggerButtons = `
    <div class="flex flex-col gap-[8px]">
      <div class="text-style-2 mb-[4px]">Dialog & Components Demo</div>
      
      <div class="text-style-4 mb-[2px]">Dialog 예제</div>
      <button onclick="showBasicAlert()" class="h-[30px] px-[14px] bg-[#2A2A30] text-white rounded-[7px] hover:bg-[#303036] active:bg-[#393941] transition-colors text-style-3 font-semibold">
        기본 Alert
      </button>
      <button onclick="showCustomAlert()" class="h-[30px] px-[14px] bg-[#2A2A30] text-white rounded-[7px] hover:bg-[#303036] active:bg-[#393941] transition-colors text-style-3 font-semibold">
        커스텀 Alert
      </button>
      <button onclick="showBasicConfirm()" class="h-[30px] px-[14px] bg-[#2A2A30] text-white rounded-[7px] hover:bg-[#303036] active:bg-[#393941] transition-colors text-style-3 font-semibold">
        기본 Confirm
      </button>
      <button onclick="showDangerConfirm()" class="h-[30px] px-[14px] bg-[#3C1E1E] text-white rounded-[7px] hover:bg-[#442222] active:bg-[#522929] transition-colors text-style-3 font-semibold">
        삭제 Confirm (위험)
      </button>
      
      <div class="text-style-4 mt-[8px] mb-[2px]">Components 예제</div>
      <button onclick="showSettingsPanel()" class="h-[30px] px-[14px] bg-[#2A2A30] text-white rounded-[7px] hover:bg-[#303036] active:bg-[#393941] transition-colors text-style-3 font-semibold">
        설정 패널
      </button>
      <button onclick="showInputForm()" class="h-[30px] px-[14px] bg-[#2A2A30] text-white rounded-[7px] hover:bg-[#303036] active:bg-[#393941] transition-colors text-style-3 font-semibold">
        입력 폼
      </button>
      <button onclick="showButtonShowcase()" class="h-[30px] px-[14px] bg-[#2A2A30] text-white rounded-[7px] hover:bg-[#303036] active:bg-[#393941] transition-colors text-style-3 font-semibold">
        버튼 쇼케이스
      </button>
    </div>
  `;

  const triggerPanel = window.api.ui.components.panel(triggerButtons, {
    title: "API 데모",
    width: 200,
  });

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position: fixed; top: 10px; left: 10px; z-index: 1000;";
  wrapper.innerHTML = triggerPanel;
  document.body.appendChild(wrapper);

  // ✨ 클린업 등록
  window.api.plugin.registerCleanup(() => {
    wrapper.remove();
    // 전역 핸들러 제거
    Object.keys(handlers).forEach((key) => {
      try {
        delete window[key];
      } catch {}
    });
  });

  console.log("[Dialog Demo] 트리거 패널 생성 완료");
})();
