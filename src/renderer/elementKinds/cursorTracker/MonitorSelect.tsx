import React, { useEffect, useState } from 'react';

import Dropdown from '@components/main/common/dropdown/Dropdown';
import { useTranslation } from '@contexts/useTranslation';
import type { PanelFieldControlProps } from '../defineElementKind';
import {
  loadPointerMonitors,
  type PointerMonitor,
} from '../runtime/pointerInput';

const PRIMARY = '';

// 화면 위치 모드의 모니터 - 비우면 주 모니터
const MonitorSelect = ({ value, onCommit }: PanelFieldControlProps) => {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState<PointerMonitor[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadPointerMonitors(true).then((list) => {
      if (!cancelled) setMonitors(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Dropdown
      commitStrategy="after-paint"
      options={[
        {
          value: PRIMARY,
          label: t('elementKinds.cursorTracker.monitorPrimary'),
        },
        ...monitors.map((monitor) => ({
          value: monitor.id,
          label: monitor.name,
        })),
      ]}
      value={typeof value === 'string' ? value : PRIMARY}
      onChange={(next) => onCommit(next === PRIMARY ? null : next)}
    />
  );
};

export default MonitorSelect;
