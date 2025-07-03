# Run after “The server is fired up and ready to roll!”
concurrency_values=(128 64 32 16 8 4 2 1)
for concurrency in "${concurrency_values[@]}"; do
python3 -m sglang.bench_serving \
    --dataset-name random \
    --random-range-ratio 1 \
    --num-prompt 500 \
    --random-input 3200 \
    --random-output 800 \
    --max-concurrency "${concurrency}"
done
