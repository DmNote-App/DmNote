use std::sync::Mutex;
use std::sync::mpsc::{channel, Receiver, Sender};

use crate::hook::event::*;

pub struct HookChannels {
    keyboard_sender: Mutex<Sender<InputEvent>>,
    mouse_sender: Mutex<Sender<InputEvent>>,
    receiver: Mutex<Receiver<InputEvent>>,
}

impl HookChannels {
    pub fn new() -> HookChannels {
        let (s, r) = channel();
        HookChannels {
            keyboard_sender: Mutex::new(s.clone()),
            mouse_sender: Mutex::new(s.clone()),
            receiver: Mutex::new(r),
        }
    }

    pub fn send_keyboard_event(&self, ke: KeyboardEvent) -> Result<(), std::sync::mpsc::SendError<InputEvent>> {
        self.keyboard_sender.lock().unwrap().send(InputEvent::Keyboard(ke))
    }

    pub fn send_mouse_event(&self, me: MouseEvent) -> Result<(), std::sync::mpsc::SendError<InputEvent>>  {
        self.mouse_sender.lock().unwrap().send(InputEvent::Mouse(me))
    }

    pub fn try_recv(&self) -> Result<InputEvent, std::sync::mpsc::TryRecvError> {
        self.receiver.lock().unwrap().try_recv()
    }

    pub fn drain(&self) {
        let guarded = self.receiver.lock().unwrap();
        let r: &Receiver<InputEvent> = &*guarded;
        while let Ok(_) = r.try_recv() {}
    }
}