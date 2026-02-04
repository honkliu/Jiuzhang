import tkinter as tk
from pynput import mouse

class ClickTester:
    def __init__(self):
        self.click_count = 0
        self.root = tk.Tk()
        self.root.title("Mouse Click Tester")
        self.root.geometry("400x200")
        
        # Create display label with large font
        self.label = tk.Label(self.root, text="0", font=("Arial", 48))
        self.label.pack(expand=True, fill=tk.BOTH)
        
        # Reset button
        reset_btn = tk.Button(self.root, text="Reset Counter", command=self.reset_counter, font=("Arial", 14))
        reset_btn.pack(pady=10)
        
        # Start mouse listener in background
        self.listener = mouse.Listener(on_click=self.on_click)
        self.listener.start()
        
        # Start the GUI
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.mainloop()

    def on_click(self, x, y, button, pressed):
        if button == mouse.Button.left and pressed:
            self.click_count += 1
            # Update from the main thread safely
            self.root.after(0, self.update_display)

    def update_display(self):
        self.label.config(text=str(self.click_count))

    def reset_counter(self):
        self.click_count = 0
        self.update_display()

    def on_close(self):
        self.listener.stop()
        self.root.destroy()

if __name__ == "__main__":
    ClickTester()